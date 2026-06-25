const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

async function initTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS staff (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                phone TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS patients (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT UNIQUE NOT NULL,
                diagnosis TEXT,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS schedules (
                id SERIAL PRIMARY KEY,
                staff_id INTEGER REFERENCES staff(id),
                date_str TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER REFERENCES patients(id),
                staff_id INTEGER REFERENCES staff(id),
                date_str TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                duration INTEGER DEFAULT 30,
                status TEXT DEFAULT 'confirmed',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                patient_id INTEGER REFERENCES patients(id),
                amount TEXT,
                description TEXT,
                receipt_image TEXT,
                status TEXT DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        console.log('✅ جداول دیتابیس ساخته شدند');

        const staffDefault = [
            { name: 'فاطمه بغدادی', role: 'admin', phone: '09120000001', password: 'admin123' },
            { name: 'آقای رحمانی', role: 'ot', phone: '09120000002', password: 'staff123' },
            { name: 'خانم شهسواری', role: 'slp', phone: '09120000003', password: 'staff123' },
            { name: 'خانم شعبانی', role: 'psychologist', phone: '09120000004', password: 'staff123' },
            { name: 'خانم علیخانی', role: 'secretary', phone: '09120000005', password: 'staff123' }
        ];

        for (const s of staffDefault) {
            await pool.query(
                `INSERT INTO staff (name, role, phone, password) 
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (phone) DO NOTHING`,
                [s.name, s.role, s.phone, s.password]
            );
        }

    } catch (err) {
        console.error('❌ خطا:', err);
    }
}

initTables();

// ============ API Routes ============

app.get('/api/staff', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM staff');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/patients', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM patients ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/patients', async (req, res) => {
    const { name, phone, diagnosis, password } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO patients (name, phone, diagnosis, password) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [name, phone, diagnosis, password]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/schedules', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM schedules');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/schedules', async (req, res) => {
    const { staffId, dateStr, startTime, endTime } = req.body;
    try {
        await pool.query(
            'DELETE FROM schedules WHERE staff_id = $1 AND date_str = $2',
            [staffId, dateStr]
        );
        const result = await pool.query(
            `INSERT INTO schedules (staff_id, date_str, start_time, end_time) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [staffId, dateStr, startTime, endTime]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/schedules/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM schedules WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/appointments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM appointments ORDER BY date_str, start_time');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/appointments', async (req, res) => {
    const { patientId, staffId, dateStr, startTime, endTime, duration, status } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO appointments (patient_id, staff_id, date_str, start_time, end_time, duration, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [patientId, staffId, dateStr, startTime, endTime, duration, status || 'confirmed']
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/appointments/:id', async (req, res) => {
    const { id } = req.params;
    const { dateStr, startTime, endTime, duration, status } = req.body;
    try {
        const result = await pool.query(
            `UPDATE appointments 
             SET date_str = $1, start_time = $2, end_time = $3, duration = $4, status = $5 
             WHERE id = $6 RETURNING *`,
            [dateStr, startTime, endTime, duration, status, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/appointments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM appointments WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/payments', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM payments ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payments', async (req, res) => {
    const { patientId, amount, description, receiptImage, status } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO payments (patient_id, amount, description, receipt_image, status) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [patientId, amount, description, receiptImage, status || 'pending']
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/payments/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        const result = await pool.query(
            'UPDATE payments SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { phone, password, type } = req.body;
    try {
        let result;
        if (type === 'staff') {
            result = await pool.query(
                'SELECT * FROM staff WHERE phone = $1 AND password = $2',
                [phone, password]
            );
        } else {
            result = await pool.query(
                'SELECT * FROM patients WHERE phone = $1 AND password = $2',
                [phone, password]
            );
        }
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(401).json({ error: 'اطلاعات وارد شده صحیح نیست' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
    console.log(`🚀 سرور روی پورت ${port} اجرا شد`);
});