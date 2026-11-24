let adminToken = sessionStorage.getItem('vitis_admin_token') || null;
let adminProducts = [];
let adminCategories = [];
let adminOrders = [];
let adminReports = null;
let activeTab = 'products';

// Elementos del DOM - Autenticación y Vistas
const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const logoutBtn = document.getElementById('logout-btn');
const loginError = document.getElementById('login-error');

// Elementos del DOM - Tablas
const adminTableBody = document.getElementById('admin-table-body');
const adminCategoriesTableBody = document.getElementById('admin-categories-table-body');
const adminOrdersTableBody = document.getElementById('admin-orders-table-body');
const selectCategory = document.getElementById('p-category');
const reportPeriodSelect = document.getElementById('report-period');
const reportSummary = document.getElementById('report-summary');
const reportSalesBody = document.getElementById('report-sales-body');
const reportTopProductsBody = document.getElementById('report-top-products-body');
const reportLowStockBody = document.getElementById('report-low-stock-body');
const downloadInventoryHistoryButton = document.getElementById('download-inventory-history');
const runForecastButton = document.getElementById('run-forecast');
const forecastStatus = document.getElementById('forecast-status');
const forecastTotalsBody = document.getElementById('forecast-totals-body');
const forecastDailyBody = document.getElementById('forecast-daily-body');
const forecastUnsupportedSection = document.getElementById('forecast-unsupported-section');
const forecastUnsupportedList = document.getElementById('forecast-unsupported-list');

// Elementos del DOM - Modal de Licores (Productos)
const formModal = document.getElementById('form-modal');
const formModalTitle = document.getElementById('form-modal-title');
const formModalCloseBtn = document.getElementById('form-modal-close-btn');
const formCancelBtn = document.getElementById('form-cancel-btn');
const addProductBtn = document.getElementById('add-product-btn');
const productForm = document.getElementById('product-form');

// Inputs del Modal de Licores
const inputId = document.getElementById('product-id');
const inputName = document.getElementById('p-name');
const inputCategory = document.getElementById('p-category');
const inputVolume = document.getElementById('p-volume');
const inputPrice = document.getElementById('p-price');
const inputStock = document.getElementById('p-stock');
const inputAbv = document.getElementById('p-abv');
const inputImage = document.getElementById('p-image');
const inputDesc = document.getElementById('p-desc');

// Elementos del DOM - Modal de Categorías
const categoryModal = document.getElementById('category-modal');
const categoryModalTitle = document.getElementById('category-modal-title');
const categoryModalCloseBtn = document.getElementById('category-modal-close-btn');
const categoryCancelBtn = document.getElementById('category-cancel-btn');
const addCategoryBtn = document.getElementById('add-category-btn');
const categoryForm = document.getElementById('category-form');

// Inputs del Modal de Categorías
const inputCategoryId = document.getElementById('category-id');
const inputCategoryName = document.getElementById('c-name');

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  setupEventListeners();
});

function setupEventListeners() {
  logoutBtn.addEventListener('click', handleLogout);
  
  // Modal de Licores
  addProductBtn.addEventListener('click', () => openFormModal());
  formModalCloseBtn.addEventListener('click', closeFormModal);
  formCancelBtn.addEventListener('click', closeFormModal);
  formModal.addEventListener('click', (e) => {
    if (e.target === formModal) closeFormModal();
  });
  
  // Modal de Categorías
  addCategoryBtn.addEventListener('click', () => openCategoryModal());
  categoryModalCloseBtn.addEventListener('click', closeCategoryModal);
  categoryCancelBtn.addEventListener('click', closeCategoryModal);
  categoryModal.addEventListener('click', (e) => {
    if (e.target === categoryModal) closeCategoryModal();
  });

  reportPeriodSelect.addEventListener('change', fetchAdminReports);
  downloadInventoryHistoryButton.addEventListener('click', downloadInventoryHistory);
  runForecastButton.addEventListener('click', fetchAdminForecast);
}

// --- CONMUTADOR DE PESTAÑAS (TABS) ---
window.switchTab = function(tab) {
  if (tab === activeTab) return;
  activeTab = tab;

  // Actualizar botones de pestañas
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`tab-btn-${tab}`).classList.add('active');

  // Actualizar secciones
  document.querySelectorAll('.admin-section').forEach(sec => sec.classList.remove('active'));
  document.getElementById(`section-${tab}`).classList.add('active');

  // Cargar datos respectivos
  if (tab === 'products') {
    fetchAdminProducts();
  } else if (tab === 'categories') {
    fetchAdminCategories();
  } else if (tab === 'orders') {
    fetchAdminOrders();
  } else if (tab === 'reports') {
    fetchAdminReports();
  } else if (tab === 'forecast') {
    fetchAdminForecast();
  }
};

// --- AUTENTICACIÓN ---
async function checkSession() {
  if (!adminToken) {
    showLoginView();
    return;
  }
  
  try {
    const response = await fetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await response.json();
    
    if (data.isValid) {
      showDashboardView();
    } else {
      sessionStorage.removeItem('vitis_admin_token');
      adminToken = null;
      showLoginView();
    }
  } catch (error) {
    console.error('Error al verificar sesión:', error);
    showLoginView();
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginError.style.display = 'none';
  
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      adminToken = data.token;
      sessionStorage.setItem('vitis_admin_token', adminToken);
      showToast(data.message, 'success');
      showDashboardView();
    } else {
      loginError.textContent = data.error || 'Credenciales incorrectas';
      loginError.style.display = 'block';
    }
  } catch (error) {
    console.error('Error de login:', error);
    loginError.textContent = 'Error al conectar con el servidor';
    loginError.style.display = 'block';
  }
}

async function handleLogout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
  } catch (e) {
    // Ignorar fallos de red al cerrar sesión
  }
  
  sessionStorage.removeItem('vitis_admin_token');
  adminToken = null;
  showToast('Sesión cerrada correctamente', 'success');
  showLoginView();
}

// Control de vistas
function showLoginView() {
  loginSection.style.display = 'block';
  dashboardSection.classList.remove('active');
  logoutBtn.style.display = 'none';
}

async function showDashboardView() {
  loginSection.style.display = 'none';
  dashboardSection.classList.add('active');
  logoutBtn.style.display = 'block';
  
  // Cargar categorías primero para que los selects estén listos, y luego productos
  await fetchAdminCategories();
  
  if (activeTab === 'products') {
    fetchAdminProducts();
  } else if (activeTab === 'categories') {
    fetchAdminCategories();
  } else if (activeTab === 'orders') {
    fetchAdminOrders();
  } else if (activeTab === 'reports') {
    fetchAdminReports();
  } else if (activeTab === 'forecast') {
    fetchAdminForecast();
  }
}

// --- CRUD DE CATEGORÍAS ---

async function fetchAdminCategories() {
  try {
    const response = await fetch('/api/categories');
    if (!response.ok) throw new Error('Error al obtener categorías');
    adminCategories = await response.json();
    
    renderAdminCategoriesTable();
    populateCategorySelect();
  } catch (error) {
    console.error(error);
    showToast('Error al cargar categorías', 'error');
  }
}

function renderAdminCategoriesTable() {
  if (adminCategories.length === 0) {
    adminCategoriesTableBody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          No hay categorías configuradas. Presione "Añadir Categoría".
        </td>
      </tr>
    `;
    return;
  }

  adminCategoriesTableBody.innerHTML = adminCategories.map(cat => {
    const isDefault = cat.id === 'cat_5'; // "Otro" no se puede borrar
    return `
      <tr>
        <td><code>${cat.id}</code></td>
        <td><strong>${cat.name}</strong></td>
        <td>
          <div class="table-actions">
            <button class="action-btn edit" onclick="openCategoryModal('${cat.id}')" title="Editar Categoría">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
            </button>
            <button class="action-btn delete" onclick="deleteCategory('${cat.id}')" title="Eliminar Categoría" ${isDefault ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function populateCategorySelect() {
  const currentValue = selectCategory.value;
  selectCategory.innerHTML = '<option value="">Seleccionar categoría...</option>' + 
    adminCategories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
  
  // Restaurar selección si aplica
  if (currentValue) selectCategory.value = currentValue;
}

function openCategoryModal(id = null) {
  categoryForm.reset();
  
  if (id) {
    const category = adminCategories.find(c => c.id === id);
    if (!category) return;
    categoryModalTitle.textContent = 'Editar Categoría';
    inputCategoryId.value = category.id;
    inputCategoryName.value = category.name;
  } else {
    categoryModalTitle.textContent = 'Añadir Categoría';
    inputCategoryId.value = '';
  }
  
  categoryModal.classList.add('active');
}

function closeCategoryModal() {
  categoryModal.classList.remove('active');
}

async function saveCategory(event) {
  event.preventDefault();
  const id = inputCategoryId.value;
  const name = inputCategoryName.value.trim();
  
  const isEdit = !!id;
  const url = isEdit ? `/api/categories/${id}` : '/api/categories';
  const method = isEdit ? 'PUT' : 'POST';
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({ name })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showToast(isEdit ? '¡Categoría actualizada correctamente!' : '¡Categoría creada con éxito!', 'success');
      closeCategoryModal();
      fetchAdminCategories();
    } else {
      showToast(data.error || 'Error al guardar la categoría', 'error');
    }
  } catch (error) {
    console.error('Error al guardar categoría:', error);
    showToast('Error en la comunicación con el servidor', 'error');
  }
}

async function deleteCategory(id) {
  if (id === 'cat_5') {
    showToast('No se puede eliminar la categoría "Otro"', 'error');
    return;
  }
  
  const category = adminCategories.find(c => c.id === id);
  if (!category) return;
  
  const confirmDelete = confirm(`¿Está seguro de que desea eliminar la categoría "${category.name}"?\nTodos los licores asociados a ella se reasignarán automáticamente a la categoría "Otro".`);
  if (!confirmDelete) return;
  
  try {
    const response = await fetch(`/api/categories/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      showToast(data.message || '¡Categoría eliminada con éxito!', 'success');
      fetchAdminCategories();
      // Recargar productos en caso de reasignaciones
      if (activeTab === 'products') fetchAdminProducts();
    } else {
      showToast(data.error || 'No se pudo eliminar la categoría', 'error');
    }
  } catch (error) {
    console.error('Error al eliminar categoría:', error);
    showToast('Error en la comunicación con el servidor', 'error');
  }
}

// --- CRUD DE LICORES (PRODUCTOS) ---

async function fetchAdminProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Error al obtener productos');
    adminProducts = await response.json();
    renderAdminTable();
  } catch (error) {
    console.error(error);
    showToast('Error al cargar inventario de licores', 'error');
  }
}

async function fetchAdminOrders() {
  try {
    const response = await fetch('/api/orders', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!response.ok) throw new Error('Error al obtener pedidos');
    adminOrders = await response.json();
    renderAdminOrders();
  } catch (error) {
    console.error('Error al cargar pedidos:', error);
    showToast('Error al cargar el historial de pedidos', 'error');
  }
}

function renderAdminOrders() {
  adminOrdersTableBody.innerHTML = '';
  if (adminOrders.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = 'Todavía no hay pedidos registrados.';
    cell.style.textAlign = 'center';
    cell.style.padding = '3rem';
    cell.style.color = 'var(--text-muted)';
    row.appendChild(cell);
    adminOrdersTableBody.appendChild(row);
    return;
  }

  for (const order of adminOrders) {
    const row = document.createElement('tr');
    const numberCell = document.createElement('td');
    numberCell.textContent = `#${order.id}`;
    row.appendChild(numberCell);

    const dateCell = document.createElement('td');
    dateCell.textContent = new Date(order.createdAt).toLocaleString('es');
    row.appendChild(dateCell);

    const productsCell = document.createElement('td');
    if (order.items.length === 0) {
      productsCell.textContent = 'Sin productos';
    } else {
      const itemList = document.createElement('ul');
      itemList.className = 'order-items-list';
      for (const item of order.items) {
        const listItem = document.createElement('li');
        listItem.textContent = `${item.name} — ${item.quantity} × $${item.unitPrice.toFixed(2)} = $${item.subtotal.toFixed(2)}`;
        itemList.appendChild(listItem);
      }
      productsCell.appendChild(itemList);
    }
    row.appendChild(productsCell);

    const totalCell = document.createElement('td');
    totalCell.textContent = `$${order.total.toFixed(2)}`;
    row.appendChild(totalCell);

    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = 'order-status-badge';
    statusBadge.textContent = order.status === 'confirmed'
      ? 'Confirmado'
      : (order.status === 'cancelled' ? 'Cancelado' : order.status);
    statusCell.appendChild(statusBadge);
    row.appendChild(statusCell);

    const actionsCell = document.createElement('td');
    if (order.status === 'confirmed') {
      const cancelButton = document.createElement('button');
      cancelButton.className = 'btn-secondary order-cancel-btn';
      cancelButton.textContent = 'Cancelar';
      cancelButton.addEventListener('click', () => cancelOrder(order.id, cancelButton));
      actionsCell.appendChild(cancelButton);
    } else {
      actionsCell.textContent = '—';
    }
    row.appendChild(actionsCell);

    adminOrdersTableBody.appendChild(row);
  }
}

async function cancelOrder(id, button) {
  const order = adminOrders.find(item => item.id === id);
  if (!order || order.status !== 'confirmed') return;
  if (!confirm(`¿Cancelar el pedido #${id}? Se restaurarán las existencias de sus productos.`)) return;

  button.disabled = true;
  try {
    const response = await fetch(`/api/orders/${id}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'No se pudo cancelar el pedido');
    }

    showToast(data.message, 'success');
    await fetchAdminOrders();
  } catch (error) {
    console.error('Error al cancelar pedido:', error);
    showToast(error.message || 'Error al cancelar el pedido', 'error');
  } finally {
    button.disabled = false;
  }
}

async function fetchAdminReports() {
  try {
    const response = await fetch(`/api/reports?period=${encodeURIComponent(reportPeriodSelect.value)}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Error al obtener reportes');
    }

    adminReports = await response.json();
    renderAdminReports();
  } catch (error) {
    console.error('Error al cargar reportes:', error);
    showToast(error.message || 'Error al cargar los reportes', 'error');
  }
}

function renderAdminReports() {
  reportSummary.innerHTML = '';
  const metrics = [
    { label: 'Ventas', value: `$${adminReports.summary.total.toFixed(2)}` },
    { label: 'Pedidos', value: String(adminReports.summary.orderCount) }
  ];

  for (const metric of metrics) {
    const card = document.createElement('article');
    card.className = 'report-stat';
    const label = document.createElement('p');
    label.textContent = metric.label;
    const value = document.createElement('strong');
    value.textContent = metric.value;
    card.append(label, value);
    reportSummary.appendChild(card);
  }

  renderReportTable(
    reportSalesBody,
    adminReports.salesByDate.map(sale => {
      const [year, month, day] = sale.date.split('-');
      return [`${day}/${month}/${year}`, sale.orderCount, `$${sale.total.toFixed(2)}`];
    }),
    'No hay ventas en este período.'
  );
  renderReportTable(
    reportTopProductsBody,
    adminReports.topProducts.map(product => [
      product.name,
      product.unitsSold,
      `$${product.sales.toFixed(2)}`
    ]),
    'No hay productos vendidos en este período.'
  );
  renderReportTable(
    reportLowStockBody,
    adminReports.lowStock.map(product => [product.name, product.category, `${product.stock} u.`]),
    'No hay productos con poco stock.'
  );
}

function renderReportTable(tableBody, rows, emptyMessage) {
  tableBody.innerHTML = '';
  if (rows.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = tableBody.closest('table').querySelectorAll('thead th').length;
    cell.textContent = emptyMessage;
    cell.style.textAlign = 'center';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  for (const values of rows) {
    const row = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.appendChild(cell);
    }
    tableBody.appendChild(row);
  }
}

async function fetchAdminForecast() {
  runForecastButton.disabled = true;
  runForecastButton.textContent = 'Calculando...';
  forecastStatus.textContent = 'El modelo está generando el pronóstico de 7 días...';

  try {
    const response = await fetch('/api/forecast', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'No se pudo generar el pronóstico.');
    }

    renderAdminForecast(data.prediction);
    forecastStatus.textContent = `Pronóstico generado a partir del ${data.prediction.forecastOrigin}. Se muestran unidades esperadas, no valores garantizados.`;
  } catch (error) {
    console.error('Error al generar pronóstico:', error);
    forecastStatus.textContent = error.message || 'No se pudo generar el pronóstico.';
    showToast(forecastStatus.textContent, 'error');
  } finally {
    runForecastButton.disabled = false;
    runForecastButton.textContent = 'Generar pronóstico';
  }
}

function renderAdminForecast(prediction) {
  renderReportTable(
    forecastTotalsBody,
    prediction.totals.map(product => [
      product.productName,
      `${product.totalUnitsForecast.toFixed(2)} unidades`
    ]),
    'No hay productos compatibles con el modelo.'
  );
  renderReportTable(
    forecastDailyBody,
    prediction.forecast.map(row => {
      const [year, month, day] = row.date.split('-');
      return [
        row.productName,
        `${day}/${month}/${year}`,
        row.unitsForecast.toFixed(2)
      ];
    }),
    'No hay pronósticos disponibles.'
  );

  forecastUnsupportedList.replaceChildren();
  forecastUnsupportedSection.hidden = prediction.unsupportedProducts.length === 0;
  for (const product of prediction.unsupportedProducts) {
    const item = document.createElement('li');
    item.textContent = `${product.productName} (${product.productId})`;
    forecastUnsupportedList.appendChild(item);
  }
}

async function downloadInventoryHistory() {
  downloadInventoryHistoryButton.disabled = true;
  try {
    const response = await fetch('/api/inventory-history?format=csv', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'No se pudo descargar el dataset');
    }

    const csv = await response.blob();
    const downloadUrl = URL.createObjectURL(csv);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'inventory-history.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    showToast('Dataset descargado correctamente', 'success');
  } catch (error) {
    console.error('Error al descargar dataset:', error);
    showToast(error.message || 'No se pudo descargar el dataset', 'error');
  } finally {
    downloadInventoryHistoryButton.disabled = false;
  }
}

function renderAdminTable() {
  if (adminProducts.length === 0) {
    adminTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-muted);">
          No hay productos en inventario. Presione "Añadir Producto" para crear uno.
        </td>
      </tr>
    `;
    return;
  }
  
  adminTableBody.innerHTML = adminProducts.map(product => {
    const isLowStock = product.stock <= 5;
    const stockClass = product.stock === 0 
      ? 'table-stock-badge low-stock' 
      : (isLowStock ? 'table-stock-badge low-stock' : 'table-stock-badge in-stock');
    const stockText = product.stock === 0 ? 'Agotado' : `${product.stock} u.`;
    
    return `
      <tr>
        <td>
          <div class="table-product-cell">
            <img src="${product.image}" alt="${product.name}" class="table-product-img" onerror="this.src='/images/placeholder.png'">
            <span class="table-product-name">${product.name}</span>
          </div>
        </td>
        <td>${product.category}</td>
        <td>${product.volume || 'N/A'}</td>
        <td><span class="table-price">$${product.price.toFixed(2)}</span></td>
        <td><span class="${stockClass}">${stockText}</span></td>
        <td>
          <div class="table-actions">
            <button class="action-btn edit" onclick="openFormModal('${product.id}')" title="Editar Licor">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
              </svg>
            </button>
            <button class="action-btn delete" onclick="deleteProduct('${product.id}')" title="Eliminar Licor">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
                <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openFormModal(id = null) {
  productForm.reset();
  
  if (id) {
    const product = adminProducts.find(p => p.id === id);
    if (!product) return;
    
    formModalTitle.textContent = 'Editar Licor';
    inputId.value = product.id;
    inputName.value = product.name;
    inputCategory.value = product.categoryId || '';
    inputVolume.value = product.volume || '';
    inputPrice.value = product.price;
    inputStock.value = product.stock;
    inputAbv.value = product.abv || '';
    inputImage.value = product.image || '';
    inputDesc.value = product.description || '';
  } else {
    formModalTitle.textContent = 'Añadir Nuevo Producto';
    inputId.value = '';
    inputImage.value = '/images/placeholder.png';
  }
  
  formModal.classList.add('active');
}

function closeFormModal() {
  formModal.classList.remove('active');
}

async function saveProduct(event) {
  event.preventDefault();
  
  const id = inputId.value;
  const productData = {
    name: inputName.value.trim(),
    categoryId: inputCategory.value,
    volume: inputVolume.value.trim() || 'N/A',
    price: parseFloat(inputPrice.value),
    stock: parseInt(inputStock.value, 10),
    abv: inputAbv.value.trim() || 'N/A',
    image: inputImage.value.trim() || '/images/placeholder.png',
    description: inputDesc.value.trim()
  };

  const isEdit = !!id;
  const url = isEdit ? `/api/products/${id}` : '/api/products';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(productData)
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast(isEdit ? '¡Producto actualizado correctamente!' : '¡Producto creado con éxito!', 'success');
      closeFormModal();
      fetchAdminProducts();
    } else {
      showToast(data.error || 'Error al guardar el producto', 'error');
    }
  } catch (error) {
    console.error('Error al guardar producto:', error);
    showToast('Error en la comunicación con el servidor', 'error');
  }
}

async function deleteProduct(id) {
  const product = adminProducts.find(p => p.id === id);
  if (!product) return;

  const confirmDelete = confirm(`¿Está seguro de que desea eliminar "${product.name}" del catálogo?`);
  if (!confirmDelete) return;

  try {
    const response = await fetch(`/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showToast('¡Producto eliminado con éxito!', 'success');
      fetchAdminProducts();
    } else {
      showToast(data.error || 'No se pudo eliminar el producto', 'error');
    }
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    showToast('Error en la comunicación con el servidor', 'error');
  }
}

// --- UTILERÍAS ---
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}
