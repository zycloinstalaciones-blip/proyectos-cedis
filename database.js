const sqlite3 = require('sqlite3').verbose();

// Esto creará un archivo llamado almacen.db en tu carpeta
const db = new sqlite3.Database('./almacen.db', (err) => {
    if (err) console.error(err.message);
    console.log('Conectado a la base de datos SQLite.');
});

db.serialize(() => {
    // 1. Creamos la tabla
    db.run(`CREATE TABLE IF NOT EXISTS Turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        placas TEXT NOT NULL,
        proveedor TEXT NOT NULL,
        folio_documento TEXT,
        tipo_llegada TEXT, 
        hora_cita DATETIME,
        hora_llegada DATETIME DEFAULT CURRENT_TIMESTAMP,
        estatus TEXT DEFAULT 'En Espera' 
    )`);
    
    // 2. Insertamos un par de datos de prueba para ver que funcione
    db.run(`INSERT INTO Turnos (placas, proveedor, folio_documento, tipo_llegada, hora_cita) 
            VALUES ('AB-123', 'Proveedor A', '99A64662', 'Citado', '2026-05-18 12:00:00')`);
            
    db.run(`INSERT INTO Turnos (placas, proveedor, folio_documento, tipo_llegada) 
            VALUES ('XY-987', 'Proveedor B', '901A', 'No Citado')`);
            
    console.log('Tabla creada y datos de prueba insertados exitosamente.');
});

db.close();