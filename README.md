# Proyecto Licorería

Aplicación web académica para administrar y explorar el catálogo de una licorería. Incluye carrito de compras, registro de pedidos con control de existencias, herramientas de administración y un módulo opcional de pronóstico de ventas.

## Funcionalidades

- Catálogo de productos con búsqueda y filtros por categoría.
- Carrito almacenado en el navegador.
- Confirmación de pedidos: el servidor verifica precios y existencias, registra el pedido y descuenta el inventario dentro de una transacción.
- Administración protegida para gestionar productos y categorías.
- Historial y cancelación de pedidos. Al cancelar, el inventario se repone una sola vez.
- Reportes de ventas por período, productos más vendidos y productos con poco stock.
- Historial diario de inventario y exportación en CSV desde administración.
- Pronóstico de unidades por producto para los próximos 7 días usando el modelo entrenado incluido en el proyecto.

## Tecnologías

- Node.js y Express
- SQLite con `better-sqlite3`
- HTML, CSS y JavaScript
- Python 3.10.20, NumPy y Joblib para ejecutar el modelo de predicción
- PyTorch se utilizó en el notebook de entrenamiento; no es necesario para ejecutar las predicciones de la aplicación

## Requisitos

- Node.js y npm
- Python 3.10.20 para el módulo de pronóstico
- El archivo del modelo `modelo/pronostico_ventas.joblib`

La aplicación principal funciona sin instalar Python. Python, NumPy y Joblib solo son necesarios para utilizar la pestaña **Pronóstico**.

## Instalación y ejecución

Clona el repositorio y entra en la carpeta del proyecto:

```bash
git clone <URL_DEL_REPOSITORIO>
cd ProyectoLicoreria
```

Instala las dependencias de Node.js:

```bash
npm install
```

Inicia el servidor:

```bash
node index.js
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador. Si el puerto 3000 está ocupado, puedes elegir otro:

```bash
PORT=3001 node index.js
```

En PowerShell, usa `$env:PORT = "3001"` antes de ejecutar `node index.js`.

## Habilitar el pronóstico

Instala las dependencias de Python en el entorno Python 3.10.20:

```bash
python -m pip install -r requirements-prediction.txt
```

En Windows, si tienes varias versiones de Python instaladas, puedes seleccionar Python 3.10 con el lanzador `py`:

```powershell
py -3.10 --version
py -3.10 -m pip install -r requirements-prediction.txt
$env:PYTHON_EXECUTABLE = (py -3.10 -c "import sys; print(sys.executable)").Trim()
node index.js
```

Verifica que `py -3.10 --version` muestre Python 3.10.20. El comando `PYTHON_EXECUTABLE` debe apuntar al mismo intérprete donde se instalaron NumPy y Joblib. En otras plataformas, configura la variable de entorno `PYTHON_EXECUTABLE` con la ruta al ejecutable de Python deseado antes de iniciar el servidor.

El pronóstico depende de `modelo/pronostico_ventas.joblib` y del historial sintético de inventario. El archivo Joblib usa serialización basada en pickle: carga únicamente el modelo confiable incluido con el proyecto; no cargues archivos de modelos de origen desconocido.

## Acceso de administración

En el sitio, selecciona **Administración**. Las credenciales predeterminadas del proyecto son:

- Usuario: `admin`
- Contraseña: `aaa123`

Son credenciales de demostración definidas en `index.js`; no son adecuadas para una aplicación publicada o de producción.

## Base de datos y datos

La base de datos SQLite se encuentra en `data/licoreria.db`. Al iniciar, el servidor crea las tablas que necesita. Si la base de datos aún no contiene productos ni categorías, importa los datos iniciales de `data/products.json` y `data/categories.json`.

El proyecto incluye un historial sintético para practicar el análisis y generar pronósticos. El modelo fue entrenado con datos sintéticos, por lo que sus resultados son demostrativos y no representan una predicción validada de ventas reales. Los snapshots observados se registran mientras el servidor está activo y ante cambios de inventario; no reconstruyen los días en que estuvo apagado.

El checkout registra pedidos y actualiza existencias, pero no procesa pagos en línea.

## Estructura principal

```text
data/
  categories.json
  products.json
  licoreria.db
dataset/
  inventory-history.csv
modelo/
  pronostico_ventas.joblib
public/
  admin.html
  index.html
  css/
  js/
index.js
predict_sales.py
predLicor.ipynb
requirements-prediction.txt
```
