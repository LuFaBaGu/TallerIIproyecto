const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { spawn } = require('child_process');
require('colors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'products.json');
const CATEGORIES_FILE = path.join(__dirname, 'data', 'categories.json');
const DB_FILE = path.join(__dirname, 'data', 'licoreria.db');

const db = new Database(DB_FILE);
db.pragma('foreign_keys = ON');
db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE
    );

    CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        categoryId TEXT NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        description TEXT NOT NULL DEFAULT '',
        price REAL NOT NULL,
        stock INTEGER NOT NULL,
        image TEXT NOT NULL DEFAULT '/images/placeholder.png',
        abv TEXT NOT NULL DEFAULT 'N/A',
        volume TEXT NOT NULL DEFAULT 'N/A'
    );

    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL DEFAULT 'confirmed',
        total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
        subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0)
    );

    CREATE TABLE IF NOT EXISTS inventory_history (
        date TEXT NOT NULL,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        category_name TEXT NOT NULL,
        price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        opening_stock INTEGER CHECK (opening_stock >= 0),
        stock_on_hand INTEGER NOT NULL CHECK (stock_on_hand >= 0),
        units_sold INTEGER NOT NULL CHECK (units_sold >= 0),
        units_received INTEGER CHECK (units_received >= 0),
        source TEXT NOT NULL CHECK (source IN ('synthetic', 'observed')),
        PRIMARY KEY (date, product_id)
    );

    CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
`);

db.prepare("UPDATE orders SET status = 'confirmed' WHERE status = 'simulated'").run();

function readJsonFile(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') {
            return fallback;
        }
        throw error;
    }
}

function migrateJsonData() {
    const migration = db.prepare("SELECT value FROM app_meta WHERE key = 'json_migration_v1'").get();
    if (migration) {
        return;
    }

    const categoriesCount = db.prepare('SELECT COUNT(*) AS count FROM categories').get().count;
    const productsCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count;

    const migrate = db.transaction(() => {
        if (categoriesCount === 0 && productsCount === 0) {
            const categories = readJsonFile(CATEGORIES_FILE, [
                { id: 'cat_1', name: 'Vino' },
                { id: 'cat_2', name: 'Whisky' },
                { id: 'cat_3', name: 'Ginebra' },
                { id: 'cat_4', name: 'Cerveza' },
                { id: 'cat_5', name: 'Otro' }
            ]);
            const products = readJsonFile(DATA_FILE, []);

            if (!Array.isArray(categories) || !Array.isArray(products)) {
                throw new Error('Los archivos JSON de productos y categorías deben contener arreglos.');
            }
            if (!categories.some(category => category.id === 'cat_5')) {
                categories.push({ id: 'cat_5', name: 'Otro' });
            }

            const insertCategory = db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)');
            for (const category of categories) {
                insertCategory.run(String(category.id), category.name);
            }

            const categoryIds = new Set(categories.map(category => String(category.id)));
            const insertProduct = db.prepare(`
                INSERT INTO products (id, name, categoryId, description, price, stock, image, abv, volume)
                VALUES (@id, @name, @categoryId, @description, @price, @stock, @image, @abv, @volume)
            `);
            for (const product of products) {
                insertProduct.run({
                    id: String(product.id),
                    name: product.name,
                    categoryId: categoryIds.has(String(product.categoryId)) ? String(product.categoryId) : 'cat_5',
                    description: product.description || '',
                    price: product.price,
                    stock: product.stock,
                    image: product.image || '/images/placeholder.png',
                    abv: product.abv || 'N/A',
                    volume: product.volume || 'N/A'
                });
            }

            console.log(`Datos importados desde JSON: ${products.length} productos y ${categories.length} categorías.`);
        }

        if (!db.prepare("SELECT 1 FROM categories WHERE id = 'cat_5'").get()) {
            db.prepare("INSERT INTO categories (id, name) VALUES ('cat_5', 'Otro')").run();
        }
        db.prepare("INSERT INTO app_meta (key, value) VALUES ('json_migration_v1', 'completed')").run();
    });

    migrate();
}

migrateJsonData();

const INVENTORY_HISTORY_DAYS = 150;

function createDeterministicRandom(seedText) {
    let seed = 2166136261;
    for (const character of seedText) {
        seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
    }

    return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
}

function seedSyntheticInventoryHistory() {
    const seeded = db.prepare("SELECT 1 FROM app_meta WHERE key = 'synthetic_inventory_history_v1'").get();
    if (seeded) {
        return;
    }

    const products = db.prepare(`
        SELECT products.id, products.name, products.price, products.stock, categories.name AS category
        FROM products
        JOIN categories ON categories.id = products.categoryId
    `).all();
    const insertHistory = db.prepare(`
        INSERT OR IGNORE INTO inventory_history (
            date, product_id, product_name, category_name, price_cents,
            opening_stock, stock_on_hand, units_sold, units_received, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic')
    `);
    const markSeeded = db.prepare("INSERT INTO app_meta (key, value) VALUES ('synthetic_inventory_history_v1', ?)");
    const seededAt = new Date().toISOString();
    const seedHistory = db.transaction(() => {
        for (const product of products) {
            let stock = Math.max(12, product.stock + 8);
            const basePriceCents = Math.round(product.price * 100);
            const averageDemand = 0.25 + createDeterministicRandom(product.id)() * 1.5;

            for (let daysAgo = INVENTORY_HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
                const date = new Date();
                date.setUTCHours(0, 0, 0, 0);
                date.setUTCDate(date.getUTCDate() - daysAgo);
                const dateString = date.toISOString().slice(0, 10);
                const random = createDeterministicRandom(`${product.id}:${dateString}`);
                const weekday = date.getUTCDay();
                const weekendFactor = weekday === 5 || weekday === 6 ? 1.6 : 1;
                const demand = Math.floor(random() * (averageDemand * weekendFactor * 3 + 1));
                const openingStock = stock;
                const unitsReceived = stock <= Math.max(5, Math.ceil(averageDemand * 5)) || daysAgo % 21 === 0
                    ? 8 + Math.floor(random() * 13)
                    : 0;
                const unitsSold = Math.min(demand, stock + unitsReceived);
                stock += unitsReceived - unitsSold;

                const priceFactor = 0.96 + random() * 0.08;
                const priceCents = Math.max(0, Math.round(basePriceCents * priceFactor));
                insertHistory.run(
                    dateString,
                    product.id,
                    product.name,
                    product.category,
                    priceCents,
                    openingStock,
                    stock,
                    unitsSold,
                    unitsReceived
                );
            }
        }

        markSeeded.run(seededAt);
    });

    seedHistory();
}

function recordDailyInventorySnapshot() {
    const date = new Date().toISOString().slice(0, 10);
    const products = db.prepare(`
        SELECT products.id, products.name, products.price, products.stock, categories.name AS category
        FROM products
        JOIN categories ON categories.id = products.categoryId
    `).all();
    const dailySales = db.prepare(`
        SELECT order_items.product_id AS productId, SUM(order_items.quantity) AS unitsSold
        FROM order_items
        JOIN orders ON orders.id = order_items.order_id
        WHERE orders.status = 'confirmed'
          AND date(orders.created_at) = ?
          AND order_items.product_id IS NOT NULL
        GROUP BY order_items.product_id
    `).all(date);
    const salesByProduct = new Map(dailySales.map(sale => [sale.productId, sale.unitsSold]));
    const upsertSnapshot = db.prepare(`
        INSERT INTO inventory_history (
            date, product_id, product_name, category_name, price_cents,
            opening_stock, stock_on_hand, units_sold, units_received, source
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, 'observed')
        ON CONFLICT(date, product_id) DO UPDATE SET
            product_name = excluded.product_name,
            category_name = excluded.category_name,
            price_cents = excluded.price_cents,
            opening_stock = NULL,
            stock_on_hand = excluded.stock_on_hand,
            units_sold = excluded.units_sold,
            source = 'observed'
    `);

    const saveSnapshots = db.transaction(() => {
        for (const product of products) {
            upsertSnapshot.run(
                date,
                product.id,
                product.name,
                product.category,
                Math.round(product.price * 100),
                product.stock,
                salesByProduct.get(product.id) || 0
            );
        }
    });
    saveSnapshots();
}

function scheduleDailyInventorySnapshot() {
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setUTCHours(24, 0, 0, 0);
    const timeout = setTimeout(() => {
        recordDailyInventorySnapshot();
        scheduleDailyInventorySnapshot();
    }, nextDay.getTime() - now.getTime());
    timeout.unref();
}

seedSyntheticInventoryHistory();
recordDailyInventorySnapshot();
scheduleDailyInventorySnapshot();

// Credenciales del Administrador (Simulado, cambiar en producción)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'aaa123';

// Almacén en memoria de sesiones activas
const activeSessions = new Set();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de Autenticación para Administradores
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Acceso no autorizado' });
    }
    const token = authHeader.split(' ')[1];
    if (!activeSessions.has(token)) {
        return res.status(401).json({ success: false, error: 'Sesión no válida o expirada' });
    }
    next();
}

// --- RUTAS DE AUTENTICACIÓN ---

// Login del Administrador
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        const token = crypto.randomBytes(32).toString('hex');
        activeSessions.add(token);
        return res.json({ success: true, token, message: 'Inicio de sesión exitoso' });
    }
    return res.status(401).json({ success: false, error: 'Usuario o contraseña incorrectos' });
});

// Verificar si una sesión sigue siendo válida
app.get('/api/auth/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.json({ isValid: false });
    }
    const token = authHeader.split(' ')[1];
    if (activeSessions.has(token)) {
        return res.json({ isValid: true });
    }
    return res.json({ isValid: false });
});

// Cerrar sesión
app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        activeSessions.delete(token);
    }
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
});

// --- RUTAS DE LA API DE CATEGORÍAS ---

// Obtener todas las categorías (Público)
app.get('/api/categories', (req, res) => {
    const categories = db.prepare('SELECT id, name FROM categories ORDER BY rowid').all();
    res.json(categories);
});

// Crear nueva categoría (Requiere Admin)
app.post('/api/categories', authMiddleware, (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') {
        return res.status(400).json({ success: false, error: 'El nombre de la categoría es obligatorio' });
    }

    const trimmedName = name.trim();
    const exists = db.prepare('SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE').get(trimmedName);
    if (exists) {
        return res.status(400).json({ success: false, error: 'La categoría ya existe' });
    }

    const newCategory = {
        id: 'cat_' + Date.now().toString(),
        name: trimmedName
    };

    db.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run(newCategory.id, newCategory.name);
    res.status(201).json({ success: true, category: newCategory });
});

// Editar categoría (Requiere Admin)
app.put('/api/categories/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim() === '') {
        return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });
    }

    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
    if (!category) {
        return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
    }

    const trimmedName = name.trim();
    const duplicate = db.prepare('SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE AND id != ?').get(trimmedName, id);
    if (duplicate) {
        return res.status(400).json({ success: false, error: 'Ya existe otra categoría con este nombre' });
    }

    const updateCategory = db.transaction(() => {
        db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(trimmedName, id);
        recordDailyInventorySnapshot();
    });
    updateCategory();
    res.json({ success: true, category: { id, name: trimmedName } });
});

// Eliminar categoría (Requiere Admin)
app.delete('/api/categories/:id', authMiddleware, (req, res) => {
    const { id } = req.params;

    // No permitir borrar la categoría comodín "Otro" ('cat_5') para tener siempre un fallback
    if (id === 'cat_5') {
        return res.status(400).json({ success: false, error: 'No se puede eliminar la categoría predeterminada "Otro"' });
    }

    const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(id);
    if (!category) {
        return res.status(404).json({ success: false, error: 'Categoría no encontrada' });
    }

    const deleteCategory = db.transaction(categoryId => {
        db.prepare('UPDATE products SET categoryId = ? WHERE categoryId = ?').run('cat_5', categoryId);
        db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);
        recordDailyInventorySnapshot();
    });
    deleteCategory(id);

    res.json({ success: true, message: 'Categoría eliminada con éxito. Los productos asociados fueron reasignados a "Otro".' });
});

// --- RUTAS DE LA API DE PRODUCTOS ---

// Obtener todos los productos con el nombre de su categoría resuelto dinámicamente (Público)
app.get('/api/products', (req, res) => {
    const products = db.prepare(`
        SELECT products.*, categories.name AS category
        FROM products
        JOIN categories ON categories.id = products.categoryId
        ORDER BY products.rowid
    `).all();
    res.json(products);
});

// Crear nuevo producto (Requiere Admin)
app.post('/api/products', authMiddleware, (req, res) => {
    const { name, categoryId, description, price, stock, image, abv, volume } = req.body;

    if (!name || !categoryId || !price || stock === undefined) {
        return res.status(400).json({ success: false, error: 'Faltan campos obligatorios' });
    }

    const category = db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId);
    if (!category) {
        return res.status(400).json({ success: false, error: 'La categoría seleccionada no existe' });
    }

    const newProduct = {
        id: Date.now().toString(),
        name,
        categoryId,
        description: description || '',
        price: parseFloat(price),
        stock: parseInt(stock, 10),
        image: image || '/images/placeholder.png',
        abv: abv || 'N/A',
        volume: volume || 'N/A'
    };

    const createProduct = db.transaction(() => {
        db.prepare(`
            INSERT INTO products (id, name, categoryId, description, price, stock, image, abv, volume)
            VALUES (@id, @name, @categoryId, @description, @price, @stock, @image, @abv, @volume)
        `).run(newProduct);
        recordDailyInventorySnapshot();
    });
    createProduct();
    res.status(201).json({
        success: true,
        product: { ...newProduct, category: category.name }
    });
});

// Editar un producto existente (Requiere Admin)
app.put('/api/products/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { name, categoryId, description, price, stock, image, abv, volume } = req.body;

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!product) {
        return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    const updatedProduct = {
        ...product,
        name: name !== undefined ? name : product.name,
        categoryId: categoryId !== undefined ? categoryId : product.categoryId,
        description: description !== undefined ? description : product.description,
        price: price !== undefined ? parseFloat(price) : product.price,
        stock: stock !== undefined ? parseInt(stock, 10) : product.stock,
        image: image !== undefined ? image : product.image,
        abv: abv !== undefined ? abv : product.abv,
        volume: volume !== undefined ? volume : product.volume
    };

    const category = db.prepare('SELECT name FROM categories WHERE id = ?').get(updatedProduct.categoryId);
    if (!category) {
        return res.status(400).json({ success: false, error: 'La categoría seleccionada no existe' });
    }

    const saveProduct = db.transaction(() => {
        db.prepare(`
            UPDATE products
            SET name = @name, categoryId = @categoryId, description = @description,
                price = @price, stock = @stock, image = @image, abv = @abv, volume = @volume
            WHERE id = @id
        `).run(updatedProduct);
        recordDailyInventorySnapshot();
    });
    saveProduct();
    res.json({
        success: true,
        product: { ...updatedProduct, category: category.name }
    });
});

// Eliminar un producto (Requiere Admin)
app.delete('/api/products/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const deleteProduct = db.transaction(productId => {
        recordDailyInventorySnapshot();
        return db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    });
    const result = deleteProduct(id);
    if (result.changes === 0) {
        return res.status(404).json({ success: false, error: 'Producto no encontrado' });
    }

    res.json({ success: true, message: 'Producto eliminado con éxito' });
});

class OrderError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

app.post('/api/orders', (req, res, next) => {
    const items = req.body && req.body.items;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'El carrito está vacío' });
    }

    const quantities = new Map();
    for (const item of items) {
        if (!item || typeof item.id !== 'string' || !item.id.trim() ||
            !Number.isSafeInteger(item.qty) || item.qty <= 0) {
            return res.status(400).json({ success: false, error: 'El carrito contiene productos o cantidades inválidas' });
        }

        const quantity = (quantities.get(item.id) || 0) + item.qty;
        if (!Number.isSafeInteger(quantity)) {
            return res.status(400).json({ success: false, error: 'La cantidad solicitada no es válida' });
        }
        quantities.set(item.id, quantity);
    }

    const createOrder = db.transaction(orderQuantities => {
        const orderProducts = [];
        let totalCents = 0;

        for (const [productId, quantity] of orderQuantities) {
            const product = db.prepare('SELECT id, name, price, stock FROM products WHERE id = ?').get(productId);
            if (!product) {
                throw new OrderError(409, 'Uno de los productos ya no está disponible');
            }
            if (!Number.isSafeInteger(product.stock) || product.stock < 0 ||
                !Number.isFinite(product.price) || product.price < 0) {
                throw new OrderError(409, `El producto ${product.name} tiene datos de inventario o precio no válidos.`);
            }
            if (product.stock < quantity) {
                throw new OrderError(409, `Stock insuficiente para ${product.name}. Disponible: ${product.stock}.`);
            }

            const unitPriceCents = Math.round(product.price * 100);
            const subtotalCents = unitPriceCents * quantity;
            if (!Number.isSafeInteger(unitPriceCents) || !Number.isSafeInteger(subtotalCents) ||
                !Number.isSafeInteger(totalCents + subtotalCents)) {
                throw new OrderError(400, 'El total del pedido excede el límite permitido');
            }

            totalCents += subtotalCents;
            orderProducts.push({ ...product, quantity, unitPriceCents, subtotalCents });
        }

        const orderResult = db.prepare(`
            INSERT INTO orders (status, total_cents)
            VALUES ('confirmed', ?)
        `).run(totalCents);
        const orderId = Number(orderResult.lastInsertRowid);
        const insertOrderItem = db.prepare(`
            INSERT INTO order_items (
                order_id, product_id, product_name, quantity, unit_price_cents, subtotal_cents
            ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        const decrementStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');

        for (const product of orderProducts) {
            insertOrderItem.run(
                orderId,
                product.id,
                product.name,
                product.quantity,
                product.unitPriceCents,
                product.subtotalCents
            );
            const update = decrementStock.run(product.quantity, product.id, product.quantity);
            if (update.changes !== 1) {
                throw new OrderError(409, `Stock insuficiente para ${product.name}.`);
            }
        }

        recordDailyInventorySnapshot();

        const order = db.prepare(`
            SELECT id, status, total_cents, created_at
            FROM orders
            WHERE id = ?
        `).get(orderId);

        return {
            id: order.id,
            status: order.status,
            total: order.total_cents / 100,
            createdAt: order.created_at,
            items: orderProducts.map(product => ({
                productId: product.id,
                name: product.name,
                quantity: product.quantity,
                unitPrice: product.unitPriceCents / 100,
                subtotal: product.subtotalCents / 100
            }))
        };
    });

    try {
        const order = createOrder.immediate(quantities);
        return res.status(201).json({ success: true, order });
    } catch (error) {
        if (error instanceof OrderError) {
            return res.status(error.statusCode).json({ success: false, error: error.message });
        }
        return next(error);
    }
});

app.get('/api/orders', authMiddleware, (req, res) => {
    const rows = db.prepare(`
        SELECT
            orders.id,
            orders.status,
            orders.total_cents,
            orders.created_at,
            order_items.id AS itemId,
            order_items.product_name,
            order_items.quantity,
            order_items.unit_price_cents,
            order_items.subtotal_cents
        FROM orders
        LEFT JOIN order_items ON order_items.order_id = orders.id
        ORDER BY orders.id DESC, order_items.id
    `).all();
    const orders = new Map();

    for (const row of rows) {
        if (!orders.has(row.id)) {
            orders.set(row.id, {
                id: row.id,
                status: row.status,
                total: row.total_cents / 100,
                createdAt: row.created_at,
                items: []
            });
        }

        if (row.itemId !== null) {
            orders.get(row.id).items.push({
                name: row.product_name,
                quantity: row.quantity,
                unitPrice: row.unit_price_cents / 100,
                subtotal: row.subtotal_cents / 100
            });
        }
    }

    res.json(Array.from(orders.values()));
});

app.post('/api/orders/:id/cancel', authMiddleware, (req, res, next) => {
    const orderId = Number(req.params.id);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        return res.status(400).json({ success: false, error: 'El número de pedido no es válido' });
    }

    const cancelOrder = db.transaction(id => {
        const order = db.prepare('SELECT status FROM orders WHERE id = ?').get(id);
        if (!order) {
            throw new OrderError(404, 'Pedido no encontrado');
        }
        if (order.status === 'cancelled') {
            throw new OrderError(409, 'El pedido ya fue cancelado');
        }
        if (order.status !== 'confirmed') {
            throw new OrderError(409, 'Solo se pueden cancelar pedidos confirmados');
        }

        const updateStatus = db.prepare(`
            UPDATE orders
            SET status = 'cancelled'
            WHERE id = ? AND status = 'confirmed'
        `).run(id);
        if (updateStatus.changes !== 1) {
            throw new OrderError(409, 'El pedido ya no se puede cancelar');
        }

        const items = db.prepare(`
            SELECT product_id, quantity
            FROM order_items
            WHERE order_id = ? AND product_id IS NOT NULL
        `).all(id);
        const restoreStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
        for (const item of items) {
            const result = restoreStock.run(item.quantity, item.product_id);
            if (result.changes !== 1) {
                throw new Error(`No se pudo restaurar el stock del producto ${item.product_id}`);
            }
        }
        recordDailyInventorySnapshot();
    });

    try {
        cancelOrder.immediate(orderId);
        return res.json({ success: true, message: 'Pedido cancelado; el stock fue restaurado.' });
    } catch (error) {
        if (error instanceof OrderError) {
            return res.status(error.statusCode).json({ success: false, error: error.message });
        }
        return next(error);
    }
});

app.get('/api/reports', authMiddleware, (req, res) => {
    const period = req.query.period || '30d';
    const periodFilters = {
        today: "date(orders.created_at) = date('now')",
        '7d': "orders.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days')",
        '30d': "orders.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days')",
        all: '1 = 1'
    };
    const periodFilter = periodFilters[period];
    if (!periodFilter) {
        return res.status(400).json({ success: false, error: 'El período solicitado no es válido' });
    }

    const summary = db.prepare(`
        SELECT COUNT(*) AS orderCount, COALESCE(SUM(total_cents), 0) AS totalCents
        FROM orders
        WHERE status = 'confirmed' AND ${periodFilter}
    `).get();
    const salesByDate = db.prepare(`
        SELECT date(created_at) AS date, COUNT(*) AS orderCount, SUM(total_cents) AS totalCents
        FROM orders
        WHERE status = 'confirmed' AND ${periodFilter}
        GROUP BY date(created_at)
        ORDER BY date DESC
    `).all();
    const topProducts = db.prepare(`
        SELECT
            order_items.product_name AS name,
            SUM(order_items.quantity) AS unitsSold,
            SUM(order_items.subtotal_cents) AS salesCents
        FROM order_items
        JOIN orders ON orders.id = order_items.order_id
        WHERE orders.status = 'confirmed' AND ${periodFilter}
        GROUP BY order_items.product_id, order_items.product_name
        ORDER BY unitsSold DESC, salesCents DESC, name COLLATE NOCASE
        LIMIT 5
    `).all();
    const lowStock = db.prepare(`
        SELECT products.id, products.name, categories.name AS category, products.stock
        FROM products
        JOIN categories ON categories.id = products.categoryId
        WHERE products.stock <= 5
        ORDER BY products.stock ASC, products.name COLLATE NOCASE
    `).all();

    res.json({
        period,
        summary: {
            orderCount: summary.orderCount,
            total: summary.totalCents / 100
        },
        salesByDate: salesByDate.map(sale => ({
            date: sale.date,
            orderCount: sale.orderCount,
            total: sale.totalCents / 100
        })),
        topProducts: topProducts.map(product => ({
            name: product.name,
            unitsSold: product.unitsSold,
            sales: product.salesCents / 100
        })),
        lowStock
    });
});

app.get('/api/inventory-history', authMiddleware, (req, res) => {
    const source = req.query.source;
    if (source && source !== 'synthetic' && source !== 'observed') {
        return res.status(400).json({ success: false, error: 'El origen solicitado no es válido' });
    }

    const query = `
        SELECT
            date,
            product_id AS productId,
            product_name AS productName,
            category_name AS category,
            price_cents AS priceCents,
            opening_stock AS openingStock,
            stock_on_hand AS stockOnHand,
            units_sold AS unitsSold,
            units_received AS unitsReceived,
            source
        FROM inventory_history
        ${source ? 'WHERE source = @source' : ''}
        ORDER BY date, product_id
    `;
    const rows = source
        ? db.prepare(query).all({ source })
        : db.prepare(query).all();
    const history = rows.map(row => ({
        date: row.date,
        productId: row.productId,
        productName: row.productName,
        category: row.category,
        price: row.priceCents / 100,
        openingStock: row.openingStock,
        stockOnHand: row.stockOnHand,
        unitsSold: row.unitsSold,
        unitsReceived: row.unitsReceived,
        source: row.source
    }));

    if (req.query.format !== 'csv') {
        return res.json(history);
    }

    const columns = [
        'date', 'product_id', 'product_name', 'category', 'price',
        'opening_stock', 'stock_on_hand', 'units_sold', 'units_received', 'source'
    ];
    const csvValue = value => {
        const text = value === null || value === undefined ? '' : String(value);
        const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
        return `"${safeText.replace(/"/g, '""')}"`;
    };
    const csvRows = history.map(row => [
        row.date,
        row.productId,
        row.productName,
        row.category,
        row.price.toFixed(2),
        row.openingStock,
        row.stockOnHand,
        row.unitsSold,
        row.unitsReceived,
        row.source
    ]);
    const csv = [columns, ...csvRows].map(row => row.map(csvValue).join(',')).join('\r\n');
    res.type('text/csv; charset=utf-8')
        .attachment('inventory-history.csv')
        .send(`\uFEFF${csv}`);
});

function runSalesPrediction(payload) {
    return new Promise((resolve, reject) => {
        const pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python';
        const scriptPath = path.join(__dirname, 'predict_sales.py');
        const child = spawn(pythonExecutable, [scriptPath], {
            cwd: __dirname,
            windowsHide: true,
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (error) reject(error);
            else resolve(result);
        };
        const timeout = setTimeout(() => {
            child.kill();
            finish(new Error('La predicción excedió el tiempo de espera.'));
        }, 60000);

        child.on('error', error => {
            finish(new Error(`No se pudo iniciar Python. Verifica PYTHON_EXECUTABLE y las dependencias de requirements-prediction.txt. ${error.message}`));
        });
        child.stdout.on('data', chunk => {
            stdout += chunk.toString();
            if (stdout.length > 1024 * 1024) {
                child.kill();
                finish(new Error('La respuesta del modelo excede el tamaño permitido.'));
            }
        });
        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });
        child.stdin.on('error', error => {
            finish(new Error(`No se pudieron enviar los datos al proceso de predicción. ${error.message}`));
        });
        child.on('close', code => {
            if (code !== 0) {
                return finish(new Error(stderr.trim() || `El proceso de predicción terminó con código ${code}.`));
            }

            try {
                const result = JSON.parse(stdout);
                if (!Array.isArray(result.forecast) || !Array.isArray(result.totals)) {
                    throw new Error('El modelo devolvió una respuesta incompleta.');
                }
                finish(null, result);
            } catch (error) {
                finish(new Error(`No se pudo interpretar la salida del modelo. ${error.message}`));
            }
        });

        child.stdin.end(JSON.stringify(payload));
    });
}

app.get('/api/forecast', authMiddleware, async (req, res) => {
    try {
        const modelPath = path.join(__dirname, 'modelo', 'pronostico_ventas.joblib');
        if (!fs.existsSync(modelPath)) {
            return res.status(503).json({
                success: false,
                error: `No se encontró el modelo de predicción en ${modelPath}.`
            });
        }

        const origin = db.prepare('SELECT MAX(date) AS date FROM inventory_history').get().date;
        if (!origin) {
            return res.status(503).json({ success: false, error: 'Todavía no hay historial para generar el pronóstico.' });
        }

        const products = db.prepare('SELECT id, name FROM products ORDER BY rowid').all();
        const syntheticHistory = db.prepare(`
            SELECT date, product_id AS productId, units_sold AS unitsSold
            FROM inventory_history
            WHERE source = 'synthetic'
            ORDER BY product_id, date
        `).all();
        const result = await runSalesPrediction({
            forecastOrigin: origin,
            products,
            syntheticHistory
        });

        res.json({ success: true, prediction: result });
    } catch (error) {
        console.error('Error al generar pronóstico:', error);
        res.status(503).json({
            success: false,
            error: `No se pudo generar el pronóstico. ${error.message}`
        });
    }
});

// Fallback: Redirección al index.html
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`\n=================================================`.cyan);
    console.log(`  Licorería Premium Backend está en funcionamiento`.bold.green);
    console.log(`  Servidor corriendo en: ` + `http://localhost:${PORT}`.underline.blue);
    console.log(`  Base de datos SQLite: ` + DB_FILE);
    console.log(`  Usuario Administrador: ` + `${ADMIN_USER}`.yellow);
    console.log(`  Contraseña Admin:      ` + `${ADMIN_PASS}`.yellow);
    console.log(`=================================================\n`.cyan);
});
