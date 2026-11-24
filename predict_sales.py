import json
import importlib.util
import math
import sys
import types
from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np


MODEL_PATH = Path(__file__).resolve().parent / "modelo" / "pronostico_ventas.joblib"
EXPECTED_HORIZON = 7


def require(condition, message):
    if not condition:
        raise ValueError(message)


def run_layer(values, weights, bias, use_relu):
    result = values @ weights.T + bias
    return np.maximum(result, 0) if use_relu else result


def load_trusted_model():
    if importlib.util.find_spec("torch") is None:
        torch_module = types.ModuleType("torch")
        torch_version_module = types.ModuleType("torch.torch_version")

        class TorchVersion(str):
            pass

        torch_version_module.TorchVersion = TorchVersion
        torch_module.torch_version = torch_version_module
        sys.modules["torch"] = torch_module
        sys.modules["torch.torch_version"] = torch_version_module

    # Joblib artifacts use pickle and must come from the trusted project notebook.
    return joblib.load(MODEL_PATH)


def predict(payload):
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(f"No se encontró el modelo: {MODEL_PATH}")

    artifact = load_trusted_model()
    require(isinstance(artifact, dict), "El archivo del modelo no contiene un artefacto compatible.")
    require(artifact.get("version_formato") == 1, "La versión del modelo no es compatible.")
    require(
        artifact.get("fuente_entrenamiento") == "synthetic",
        "El modelo debe estar entrenado con datos synthetic para usar este historial.",
    )
    require(artifact.get("horizonte") == EXPECTED_HORIZON, "El modelo no pronostica 7 días.")

    input_days = artifact.get("dias_entrada")
    products = artifact.get("productos")
    product_indices = artifact.get("indice_producto")
    names = artifact.get("nombres_productos")
    weights = artifact.get("pesos")
    require(isinstance(input_days, int) and input_days > 0, "El modelo no define días de entrada válidos.")
    require(isinstance(products, list) and products, "El modelo no define productos.")
    require(isinstance(product_indices, dict), "El modelo no define el índice de productos.")
    require(isinstance(weights, dict), "El modelo no contiene pesos.")

    expected_input_size = input_days + len(products) + EXPECTED_HORIZON * 2
    require(
        artifact.get("tamano_entrada") == expected_input_size,
        "El tamaño de entrada del modelo no coincide con sus metadatos.",
    )
    require(
        all(product_indices.get(product_id) == index for index, product_id in enumerate(products)),
        "El orden de productos del modelo no coincide con su índice.",
    )

    layer_weights = []
    layer_biases = []
    expected_shapes = [
        (64, expected_input_size),
        (32, 64),
        (EXPECTED_HORIZON, 32),
    ]
    for layer_index, expected_shape in zip((0, 2, 4), expected_shapes):
        weight_name = f"{layer_index}.weight"
        bias_name = f"{layer_index}.bias"
        require(weight_name in weights and bias_name in weights, f"Faltan pesos de la capa {layer_index}.")
        layer_weight = np.asarray(weights[weight_name], dtype=np.float32)
        layer_bias = np.asarray(weights[bias_name], dtype=np.float32)
        require(layer_weight.shape == expected_shape, f"La forma de {weight_name} no es válida.")
        require(layer_bias.shape == (expected_shape[0],), f"La forma de {bias_name} no es válida.")
        require(np.isfinite(layer_weight).all() and np.isfinite(layer_bias).all(), "El modelo contiene pesos no finitos.")
        layer_weights.append(layer_weight)
        layer_biases.append(layer_bias)

    sales_mean = artifact.get("media_ventas_log")
    sales_scale = artifact.get("escala_ventas_log")
    require(
        isinstance(sales_mean, (int, float)) and math.isfinite(sales_mean),
        "La media de ventas del modelo no es válida.",
    )
    require(
        isinstance(sales_scale, (int, float)) and math.isfinite(sales_scale) and sales_scale > 0,
        "La escala de ventas del modelo no es válida.",
    )

    active_products = payload.get("products")
    history_rows = payload.get("syntheticHistory")
    require(isinstance(active_products, list), "La lista de productos actuales no es válida.")
    require(isinstance(history_rows, list), "El historial sintético no es válido.")
    active_names = {
        product.get("id"): product.get("name")
        for product in active_products
        if isinstance(product, dict) and isinstance(product.get("id"), str)
    }

    history_by_product = {}
    for row in history_rows:
        if not isinstance(row, dict):
            continue
        product_id = row.get("productId")
        if product_id in product_indices:
            history_by_product.setdefault(product_id, []).append(row)

    origin = date.fromisoformat(payload["forecastOrigin"])
    future_dates = [origin + timedelta(days=offset) for offset in range(1, EXPECTED_HORIZON + 1)]
    weekdays = np.array([future_date.weekday() for future_date in future_dates], dtype=np.float32)
    angles = 2 * np.pi * weekdays / 7
    calendar_features = np.column_stack((np.sin(angles), np.cos(angles))).astype(np.float32).reshape(-1)

    forecast = []
    unsupported_products = []
    for product_id in products:
        if product_id not in active_names:
            continue

        rows = sorted(history_by_product.get(product_id, []), key=lambda row: row["date"])
        require(
            len(rows) >= input_days,
            f"Faltan días de historial sintético para el producto {active_names[product_id]!r}.",
        )
        recent_rows = rows[-input_days:]
        recent_dates = [date.fromisoformat(row["date"]) for row in recent_rows]
        require(
            all((recent_dates[index] - recent_dates[index - 1]).days == 1 for index in range(1, len(recent_dates))),
            f"El historial sintético de {active_names[product_id]!r} no tiene días consecutivos.",
        )
        history = np.array([row["unitsSold"] for row in recent_rows], dtype=np.float32)
        require(
            np.isfinite(history).all() and (history >= 0).all(),
            f"El historial de ventas de {active_names[product_id]!r} contiene valores inválidos.",
        )

        history_scaled = (np.log1p(history) - sales_mean) / sales_scale
        product_one_hot = np.zeros(len(products), dtype=np.float32)
        product_one_hot[product_indices[product_id]] = 1.0
        features = np.concatenate((history_scaled, product_one_hot, calendar_features)).astype(np.float32)
        require(features.shape == (expected_input_size,), "Las características generadas no coinciden con el modelo.")

        prediction = run_layer(features[None, :], layer_weights[0], layer_biases[0], True)
        prediction = run_layer(prediction, layer_weights[1], layer_biases[1], True)
        prediction = run_layer(prediction, layer_weights[2], layer_biases[2], False)[0]
        units = np.maximum(0.0, np.expm1(prediction * sales_scale + sales_mean))
        require(np.isfinite(units).all(), "El modelo generó un pronóstico no finito.")

        for forecast_date, forecast_units in zip(future_dates, units):
            forecast.append({
                "productId": product_id,
                "productName": active_names[product_id],
                "date": forecast_date.isoformat(),
                "unitsForecast": float(forecast_units),
            })

    trained_product_ids = set(products)
    for product in active_products:
        product_id = product.get("id")
        if product_id not in trained_product_ids:
            unsupported_products.append({
                "productId": product_id,
                "productName": product.get("name", product_id),
            })

    require(forecast, "Ningún producto actual coincide con los productos usados para entrenar el modelo.")
    totals_by_product = {}
    for row in forecast:
        totals_by_product[row["productId"]] = totals_by_product.get(row["productId"], 0.0) + row["unitsForecast"]
    totals = [
        {
            "productId": product_id,
            "productName": active_names[product_id],
            "totalUnitsForecast": total,
        }
        for product_id, total in totals_by_product.items()
    ]

    return {
        "forecastOrigin": origin.isoformat(),
        "horizon": EXPECTED_HORIZON,
        "trainingSource": artifact["fuente_entrenamiento"],
        "forecast": forecast,
        "totals": totals,
        "unsupportedProducts": unsupported_products,
    }


def main():
    payload = json.load(sys.stdin)
    print(json.dumps(predict(payload), allow_nan=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
