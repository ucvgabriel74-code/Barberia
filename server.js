const express = require('express');
const cors = require('cors');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve current folder as static root

// Connect to SQLite database
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDatabase();
  }
});

// Helper for running queries with promises
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Initialize database structure and seed data
async function initializeDatabase() {
  try {
    // Create Barberos table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS barberos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        monto_mes REAL DEFAULT 0.0
      )
    `);

    // Create Turnos table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barbero_id INTEGER NOT NULL,
        fecha TEXT NOT NULL,
        hora TEXT NOT NULL,
        servicio TEXT NOT NULL,
        cliente_nombre TEXT,
        estado TEXT NOT NULL DEFAULT 'Agendado',
        FOREIGN KEY(barbero_id) REFERENCES barberos(id)
      )
    `);

    // Create Admin table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS admin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL
      )
    `);

    // Seed barberos if empty
    const barberosCount = await dbGet('SELECT COUNT(*) as count FROM barberos');
    if (barberosCount.count === 0) {
      const initialBarbers = [
        'Gabriel Davila',
        'Genesis',
        'Leonardo',
        'Gabriel Diaz',
        'Heidy',
        'Rubén'
      ];
      for (const name of initialBarbers) {
        await dbRun('INSERT INTO barberos (nombre, monto_mes) VALUES (?, 0.0)', [name]);
      }
      console.log('Seeded initial barbers.');
    }

    // Seed admin if empty
    const adminCount = await dbGet('SELECT COUNT(*) as count FROM admin');
    if (adminCount.count === 0) {
      const defaultUser = 'admin@tubarberia.com';
      const defaultPassword = 'AdminOro2026';
      const hash = bcrypt.hashSync(defaultPassword, 10);
      await dbRun('INSERT INTO admin (usuario, password_hash) VALUES (?, ?)', [defaultUser, hash]);
      console.log('Seeded default admin user:', defaultUser);
    }

  } catch (err) {
    console.error('Error during database initialization:', err);
  }
}

// Service helper to get price
function getServicePrice(serviceName) {
  const normalized = serviceName.toLowerCase().trim();
  if (normalized.includes('corte y barba')) {
    return 8.00;
  } else if (normalized.includes('corte')) {
    return 6.00;
  } else if (normalized.includes('barba')) {
    return 3.00;
  }
  return 0.00;
}

// API Routes

// Admin Login
app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario || !password) {
    return res.status(400).json({ success: false, message: 'Usuario y contraseña requeridos' });
  }

  try {
    const adminUser = await dbGet('SELECT * FROM admin WHERE usuario = ?', [usuario.trim().toLowerCase()]);
    if (!adminUser) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const isMatch = bcrypt.compareSync(password, adminUser.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    res.json({ success: true, message: 'Ingreso exitoso', user: adminUser.usuario });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error en el servidor' });
  }
});

// Get all barbers and their earnings
app.get('/api/barberos', async (req, res) => {
  try {
    const barberos = await dbAll('SELECT * FROM barberos');
    res.json({ success: true, barberos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al obtener barberos' });
  }
});

// Get schedule slots for a barber on a specific date (with client details for admin view)
app.get('/api/agenda', async (req, res) => {
  const { barbero_id, fecha } = req.query;
  if (!barbero_id || !fecha) {
    return res.status(400).json({ success: false, message: 'barbero_id y fecha requeridos' });
  }

  try {
    const slots = [
      '08:00 AM - 08:45 AM',
      '08:45 AM - 09:30 AM',
      '09:30 AM - 10:15 AM',
      '10:15 AM - 11:00 AM',
      '11:00 AM - 11:45 AM',
      '11:45 AM - 12:30 PM',
      '12:30 PM - 01:15 PM',
      '01:15 PM - 02:00 PM',
      '02:00 PM - 02:45 PM',
      '02:45 PM - 03:30 PM',
      '03:30 PM - 04:15 PM',
      '04:15 PM - 05:00 PM'
    ];

    // Query all columns including client name and service
    const turnos = await dbAll(
      'SELECT hora, cliente_nombre, servicio FROM turnos WHERE barbero_id = ? AND fecha = ?',
      [barbero_id, fecha]
    );

    const agenda = slots.map(slot => {
      const booking = turnos.find(t => t.hora === slot);
      return {
        hora: slot,
        estado: booking ? 'Agendado' : 'Disponible',
        cliente_nombre: booking ? booking.cliente_nombre : null,
        servicio: booking ? booking.servicio : null
      };
    });

    res.json({ success: true, agenda });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al obtener la agenda' });
  }
});

// Book an appointment (Public or internal cashier)
app.post('/api/agendar', async (req, res) => {
  const { barbero_id, fecha, hora, servicio, cliente_nombre } = req.body;

  if (!barbero_id || !fecha || !hora || !servicio) {
    return res.status(400).json({ success: false, message: 'Todos los campos son obligatorios' });
  }

  try {
    // Check if slot is already booked (double booking prevention)
    const existing = await dbGet(
      'SELECT id FROM turnos WHERE barbero_id = ? AND fecha = ? AND hora = ?',
      [barbero_id, fecha, hora]
    );

    if (existing) {
      return res.status(400).json({ success: false, message: 'Este turno ya está agendado' });
    }

    // Insert appointment
    await dbRun(
      'INSERT INTO turnos (barbero_id, fecha, hora, servicio, cliente_nombre, estado) VALUES (?, ?, ?, ?, ?, ?)',
      [barbero_id, fecha, hora, servicio, cliente_nombre || 'Cliente Web', 'Agendado']
    );

    // Calculate price and add to barber's monthly earnings
    const price = getServicePrice(servicio);
    await dbRun(
      'UPDATE barberos SET monto_mes = monto_mes + ? WHERE id = ?',
      [price, barbero_id]
    );

    res.json({ success: true, message: 'Cita agendada exitosamente', precio: price });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al agendar cita' });
  }
});

// Reset monthly earnings (End of Month)
app.post('/api/admin/reset-month', async (req, res) => {
  try {
    // Clean monthly earnings
    await dbRun('UPDATE barberos SET monto_mes = 0.0');
    // Clear scheduled turnos to start fresh
    await dbRun('DELETE FROM turnos');
    
    res.json({ success: true, message: 'Ingresos y agenda del mes reiniciados a cero.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error al reiniciar contadores' });
  }
});

// Redirect root to public SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
