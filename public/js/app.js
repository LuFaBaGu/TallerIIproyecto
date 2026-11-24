// Estado global del catálogo
let products = [];
let categories = [];
let cart = JSON.parse(localStorage.getItem('vitis_cart')) || [];
let activeCategory = 'todos';
let searchQuery = '';

// Elementos del DOM
const productsGrid = document.getElementById('products-grid');
const searchInput = document.getElementById('search-input');
const categoriesContainer = document.getElementById('categories-container');
const cartCount = document.getElementById('cart-count');
const cartToggleBtn = document.getElementById('cart-toggle-btn');
const cartCloseBtn = document.getElementById('cart-close-btn');
const cartSidebar = document.getElementById('cart-sidebar');
const cartOverlay = document.getElementById('cart-overlay');
const cartItemsContainer = document.getElementById('cart-items-container');
const cartTotalPrice = document.getElementById('cart-total-price');
const checkoutBtn = document.getElementById('checkout-btn');

// Elementos del Modal
const productModal = document.getElementById('product-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalImage = document.getElementById('modal-image');
const modalCategory = document.getElementById('modal-category');
const modalTitle = document.getElementById('modal-title');
const modalAbv = document.getElementById('modal-abv');
const modalVolume = document.getElementById('modal-volume');
const modalDesc = document.getElementById('modal-desc');
const modalPrice = document.getElementById('modal-price');
const modalAddBtn = document.getElementById('modal-add-btn');

// --- INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', () => {
  fetchCategories();
  fetchProducts();
  updateCartUI();
  setupEventListeners();
});

// --- EVENTOS ---
function setupEventListeners() {
  // Buscador con debounce simple
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.toLowerCase().trim();
      renderProducts();
    }, 250);
  });

  // Filtros de categoría
  categoriesContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('filter-btn')) {
      // Remover clase activa de todos
      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
      // Añadir clase activa al presionado
      e.target.classList.add('active');
      
      activeCategory = e.target.dataset.category;
      renderProducts();
    }
  });

  // Toggle Carrito
  cartToggleBtn.addEventListener('click', () => toggleCart(true));
  cartCloseBtn.addEventListener('click', () => toggleCart(false));
  cartOverlay.addEventListener('click', () => toggleCart(false));

  // Modal Cerrar
  modalCloseBtn.addEventListener('click', () => toggleModal(false, null));
  productModal.addEventListener('click', (e) => {
    if (e.target === productModal) toggleModal(false, null);
  });

  checkoutBtn.addEventListener('click', handleCheckout);
}

// --- PETICIONES API ---
async function handleCheckout() {
  if (cart.length === 0 || checkoutBtn.disabled) return;

  checkoutBtn.disabled = true;
  checkoutBtn.textContent = 'Registrando pedido...';

  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(item => ({ id: item.id, qty: item.qty }))
      })
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('No se pudo interpretar la respuesta del servidor.');
    }

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo registrar el pedido.');
    }

    cart = [];
    saveCart();
    updateCartUI();
    await fetchProducts();
    toggleCart(false);
    showToast(`Pedido #${data.order.id} confirmado. Total: $${data.order.total.toFixed(2)}.`, 'success');
  } catch (error) {
    console.error('Error al registrar el pedido:', error);
    showToast(error.message || 'No se pudo registrar el pedido.', 'error');
  } finally {
    checkoutBtn.textContent = 'Confirmar pedido';
    checkoutBtn.disabled = cart.length === 0;
  }
}

async function fetchCategories() {
  try {
    const response = await fetch('/api/categories');
    if (!response.ok) throw new Error('Error al cargar categorías');
    categories = await response.json();
    renderCategoryFilters();
  } catch (error) {
    console.error('Error al cargar categorías:', error);
  }
}

function renderCategoryFilters() {
  categoriesContainer.innerHTML = `
    <button class="filter-btn ${activeCategory === 'todos' ? 'active' : ''}" data-category="todos">Todos</button>
  ` + categories.map(cat => `
    <button class="filter-btn ${activeCategory === cat.name ? 'active' : ''}" data-category="${cat.name}">${cat.name}</button>
  `).join('');
}

async function fetchProducts() {
  try {
    const response = await fetch('/api/products');
    if (!response.ok) throw new Error('Error al cargar productos');
    products = await response.json();
    renderProducts();
  } catch (error) {
    console.error(error);
    productsGrid.innerHTML = `
      <div class="no-products">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
        <p>No se pudo cargar el catálogo de productos. Inténtelo más tarde.</p>
      </div>
    `;
  }
}

// --- RENDERIZACIÓN ---
function renderProducts() {
  // Filtrar productos
  const filtered = products.filter(product => {
    const matchesCategory = activeCategory === 'todos' || product.category === activeCategory;
    const matchesSearch = product.name.toLowerCase().includes(searchQuery) || 
                          product.description.toLowerCase().includes(searchQuery) ||
                          product.category.toLowerCase().includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    productsGrid.innerHTML = `
      <div class="no-products">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.637 10.637Z" />
        </svg>
        <p>No encontramos licores que coincidan con su búsqueda.</p>
      </div>
    `;
    return;
  }

  productsGrid.innerHTML = filtered.map(product => {
    const hasStock = product.stock > 0;
    
    return `
      <article class="product-card" data-id="${product.id}">
        <div class="product-image-wrapper" onclick="openProductDetail('${product.id}')" style="cursor: pointer;">
          <img src="${product.image}" alt="${product.name}" class="product-img" onerror="this.src='/images/placeholder.png'">
          <span class="product-badge">${product.category}</span>
        </div>
        <div class="product-info">
          <div class="product-meta">
            <span>Vol: ${product.volume || 'N/A'}</span>
            <span>ABV: ${product.abv || 'N/A'}</span>
          </div>
          <h3 class="product-name" onclick="openProductDetail('${product.id}')" style="cursor: pointer;">${product.name}</h3>
          <p class="product-description">${product.description}</p>
          <div class="product-footer">
            <span class="product-price">$${product.price.toFixed(2)}</span>
            ${hasStock 
              ? `<button class="add-to-cart-btn" onclick="addToCart('${product.id}')" aria-label="Añadir al carrito">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" width="20" height="20">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                 </button>`
              : `<span class="out-of-stock-text">Agotado</span>`
            }
          </div>
        </div>
      </article>
    `;
  }).join('');
}

// --- DETALLE DE PRODUCTO (MODAL) ---
function openProductDetail(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  toggleModal(true, product);
}

function toggleModal(show, product = null) {
  if (show && product) {
    modalImage.src = product.image;
    modalImage.onerror = () => { modalImage.src = '/images/placeholder.png'; };
    modalCategory.textContent = product.category;
    modalTitle.textContent = product.name;
    modalAbv.textContent = product.abv || 'N/A';
    modalVolume.textContent = product.volume || 'N/A';
    modalDesc.textContent = product.description;
    modalPrice.textContent = `$${product.price.toFixed(2)}`;
    
    const hasStock = product.stock > 0;
    if (hasStock) {
      modalAddBtn.disabled = false;
      modalAddBtn.textContent = 'Añadir al Carrito';
      modalAddBtn.onclick = () => {
        addToCart(product.id);
        toggleModal(false);
      };
    } else {
      modalAddBtn.disabled = true;
      modalAddBtn.textContent = 'Agotado';
      modalAddBtn.onclick = null;
    }
    
    productModal.classList.add('active');
  } else {
    productModal.classList.remove('active');
  }
}

// --- GESTIÓN DEL CARRITO (CLIENT SIDE) ---
function toggleCart(show) {
  if (show) {
    cartSidebar.classList.add('active');
    cartOverlay.classList.add('active');
  } else {
    cartSidebar.classList.remove('active');
    cartOverlay.classList.remove('active');
  }
}

function addToCart(id) {
  const product = products.find(p => p.id === id);
  if (!product || product.stock <= 0) return;

  const cartItem = cart.find(item => item.id === id);
  if (cartItem) {
    if (cartItem.qty >= product.stock) {
      showToast(`Stock máximo alcanzado para este producto (${product.stock} unidades)`, 'error');
      return;
    }
    cartItem.qty++;
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image,
      qty: 1
    });
  }

  saveCart();
  updateCartUI();
  showToast(`¡${product.name} añadido al carrito!`, 'success');
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  updateCartUI();
}

function updateCartUI() {
  // Actualizar contador
  const totalCount = cart.reduce((total, item) => total + item.qty, 0);
  cartCount.textContent = totalCount;
  
  if (cart.length === 0) {
    cartItemsContainer.innerHTML = `<div class="cart-empty-message">Su carrito está vacío.</div>`;
    cartTotalPrice.textContent = '$0.00';
    checkoutBtn.disabled = true;
    return;
  }

  checkoutBtn.disabled = false;
  
  // Renderizar items
  cartItemsContainer.innerHTML = cart.map(item => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}" class="cart-item-img" onerror="this.src='/images/placeholder.png'">
      <div class="cart-item-details">
        <h4 class="cart-item-name">${item.name}</h4>
        <div class="cart-item-price-qty">
          ${item.qty} x <span>$${item.price.toFixed(2)}</span>
        </div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart('${item.id}')" aria-label="Eliminar item">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="18" height="18">
          <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
      </button>
    </div>
  `).join('');

  // Actualizar precio total
  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  cartTotalPrice.textContent = `$${total.toFixed(2)}`;
}

function saveCart() {
  localStorage.setItem('vitis_cart', JSON.stringify(cart));
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
