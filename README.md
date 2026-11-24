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

## Iniciar con Docker

Se requiere Docker con Docker Compose. Antes del primer inicio, crea el archivo `.env` a partir de la plantilla:

```bash
cp .env.example .env
```

Edita `.env` y define `ADMIN_USER` y `ADMIN_PASS` con tus propias credenciales. No subas `.env` a GitHub; está excluido por `.gitignore`.

En Windows PowerShell, puedes crear la copia con `Copy-Item .env.example .env`.

Luego, desde la raíz del repositorio, ejecuta:

```bash
docker compose up --build
```

Abre [http://localhost:8080](http://localhost:8080). Docker Compose levanta estos servicios:

- `frontend`: Nginx sirve los archivos web y redirige las solicitudes `/api` al backend.
- `backend`: Node.js/Express atiende la API, accede a SQLite y ejecuta el modelo con Python 3.10.20.
- `db`: mantiene disponible el volumen persistente que contiene el archivo SQLite.

SQLite es una base de datos embebida en un archivo, no un servidor SQL. Por eso el servicio `db` administra almacenamiento persistente compartido; el backend abre directamente el archivo `licoreria.db`. Los datos sobreviven al reinicio o recreación de los contenedores mientras se conserve el volumen.

Para detener los servicios:

```bash
docker compose down
```

Para reconstruir las imágenes después de cambiar el código:

```bash
docker compose up --build
```

Compose carga las variables de `.env` y las entrega al backend. Si falta alguna, el inicio falla en vez de utilizar credenciales predeterminadas.

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

En PowerShell, define las credenciales en la terminal:

```powershell
$env:ADMIN_USER = "<tu_usuario>"
$env:ADMIN_PASS = "<tu_contraseña>"
node index.js
```

En Bash, puedes iniciarlo así:

```bash
ADMIN_USER="<tu_usuario>" ADMIN_PASS="<tu_contraseña>" node index.js
```

Abre [http://localhost:3000](http://localhost:3000) en el navegador. Si el puerto 3000 está ocupado, puedes elegir otro:

```bash
PORT=3001 node index.js
```

En PowerShell, configura también `$env:PORT = "3001"` antes de ejecutar `node index.js`.

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

En el sitio, selecciona **Administración** e ingresa el usuario y la contraseña configurados para el proceso. Con Docker, se definen en `.env`; al ejecutar Node directamente, deben estar en las variables de entorno de la terminal. El proyecto ya no incluye credenciales predeterminadas en el código ni en la interfaz.

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
.env.example
docker-compose.yml
Dockerfile.backend
Dockerfile.frontend
nginx.conf
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
