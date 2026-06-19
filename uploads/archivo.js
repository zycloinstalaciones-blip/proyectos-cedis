const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const multer = require('multer');
const XLSX = require('xlsx');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 15 * 1024 * 1024 } // 15 MB
});

const {
    CONFIG_UNIDADES,
    getUnitConfig,
    isValidUnitType,
    deriveUnitFields
} = require('./config/unidades-config');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const db = new sqlite3.Database('./almacen.db');
db.run('PRAGMA foreign_keys = ON');

const fabricantes = JSON.parse(fs.readFileSync(path.join(__dirname, 'fabricantes.json'), 'utf8'));
const usuarios = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'config', 'usuarios.json'), 'utf8')
);

// ======================================================
// MIDDLEWARES
// ======================================================
app.use(session({
    secret: 'azulemex_session_secret_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 8 // 8 horas
    }
}));

app.use(express.json());

// ======================================================
// HELPERS DE ROLES / AUTENTICACIÓN
// ======================================================
function normalizarRol(rawRol) {
    const rol = String(rawRol || '').trim().toLowerCase();

    if (rol === 'admin') return 'admin';
    if (rol === 'operativo') return 'operativo';
    if (rol === 'oficial') return 'oficial';
    if (rol === 'registro_operadores') return 'registro_operadores';
    if (rol === 'externo') return 'externo';

    // Compatibilidad con textos viejos
    if (rol.includes('oficial')) return 'oficial';
    if (rol.includes('jefe') || rol.includes('jefatura')) return 'operativo';
    if (rol.includes('registro')) return 'registro_operadores';
    if (rol.includes('externo')) return 'externo';

    return rol;
}

function obtenerHomePagePorRol(rol) {
    if (rol === 'admin') return '/recepcion.html';
    if (rol === 'operativo') return '/admin.html';
    if (rol === 'oficial') return '/bitacora.html';
    if (rol === 'registro_operadores') return '/monitor.html';
    if (rol === 'externo') return '/monitor.html?tv=1';
    return '/login.html';
}

function requireAuth(rolesPermitidos = []) {
    return (req, res, next) => {
        const usuario = req.session?.user;

        if (!usuario) {
            return res.redirect('/login.html');
        }

        const rol = normalizarRol(usuario.rol);

        if (!rolesPermitidos.length) {
            return next();
        }

        if (rol === 'admin') {
            return next();
        }

        if (!rolesPermitidos.includes(rol)) {
            return res.redirect(obtenerHomePagePorRol(rol));
        }

        next();
    };
}

function requireApiAuth(rolesPermitidos = []) {
    return (req, res, next) => {
        const usuario = req.session?.user;

        if (!usuario) {
            return res.status(401).json({ error: 'No autenticado' });
        }

        const rol = normalizarRol(usuario.rol);

        if (rol === 'admin') {
            return next();
        }

        if (!rolesPermitidos.length) {
            return next();
        }

        if (!rolesPermitidos.includes(rol)) {
            return res.status(403).json({ error: 'No autorizado para esta operación' });
        }

        next();
    };
}
// Leer Celda Segura //
// ======================================================
// HELPERS PRE / IMPORTACIÓN EXCEL
// ======================================================
function safe(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
}

function extraerPreDocumento(rows, sheetName = '') {
    const bloques = [
        ...(rows[0] || []),
        ...(rows[1] || []),
        ...(rows[2] || []),
        ...(rows[3] || []),
        ...(rows[4] || []),
        sheetName || ''
    ];

    const texto = bloques
        .map(safe)
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Caso 1: "Entrada Compra 99A69536"
    let match = texto.match(/Entrada\s+Compra\s+([A-Z0-9-]+)/i);
    if (match) {
        return {
            pre: match[1].toUpperCase(),
            detectado: true
        };
    }

    // Caso 2: "PRE 99A69536"
    match = texto.match(/\bPRE\s+([A-Z0-9-]+)/i);
    if (match) {
        return {
            pre: match[1].toUpperCase(),
            detectado: true
        };
    }

    // Caso 3: folio tipo 99A69536 suelto en encabezado
    match = texto.match(/\b\d{2}[A-Z]\d{4,}\b/i);
    if (match) {
        return {
            pre: match[0].toUpperCase(),
            detectado: true
        };
    }

    return {
        pre: '',
        detectado: false
    };
}

function detectarCargaTipo(texto) {
    const t = safe(texto).toLowerCase();
    if (t.includes('palletizado')) return 'Palletizado';
    if (t.includes('granel')) return 'Granel';
    return '';
}

function detectarUnidadTipo(texto) {
    const t = safe(texto).toLowerCase();
    if (t.includes('plataforma')) return 'Plataforma';
    if (t.includes('caja cerrada')) return 'Caja Cerrada';
    if (t.includes('camioneta')) return 'Camioneta';
    if (t.includes('thorton')) return 'Thorton';
    if (t.includes('contenedor')) return 'Contenedor';
    return '';
}

function esFilaPie(row) {
    const texto = row.map(safe).join(' ').toLowerCase();
    return (
        texto.includes('total descarga') ||
        texto.includes('nombre') ||
        texto.includes('firma') ||
        texto.includes('coms.rep') ||
        texto.includes('pagina')
    );
}

function parseSheet(ws, sheetName, fileName) {
    const rows = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        raw: false,
        defval: ''
    });

    if (!rows || rows.length < 7) return null;

    const row1 = rows[0] || [];
    const row3 = rows[2] || [];
    const row4 = rows[3] || [];
    const row5 = rows[4] || [];

    // Encabezado base
    const empresa = safe(row1[1]);
    const fechaDocumento = safe(row1[2]);

    const tipoDocumento = safe(row3[0]);      // PRE
    const estatusDocumento = safe(row3[2]);   // Sin Afectar
    const moneda = safe(row3[3]);             // Pesos
    const proveedor = safe(row4[1]);

    // PRE / Entrada Compra
    const preDetectado = extraerPreDocumento(rows, sheetName);
    const preEntradaCompra = preDetectado.pre || '';
    const prePendienteCorreccion = preEntradaCompra ? 0 : 1;

    // Referencia / concepto / observaciones
    const valoresRC = safe(row5[1])
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean);

    const referencia = valoresRC[0] || '';
    const concepto = valoresRC[1] || '';
    const observaciones = valoresRC.slice(2).join(' | ');

    // Detección de unidad/carga sobre encabezado combinado
    const encabezadoTexto = [
        ...row3,
        ...row4,
        ...row5
    ].map(safe).join(' | ');

    const cargaTipo = detectarCargaTipo(encabezadoTexto);
    const unidadTipo = detectarUnidadTipo(encabezadoTexto);

    const palletsEntrada = safe(row5[4]);

    // Partidas (fila 7 en adelante)
    const partidas = [];
    let totalDescarga = null;
    let unidadTotalDescarga = '';

    for (let i = 6; i < rows.length; i++) {
        const row = rows[i] || [];

        if (esFilaPie(row)) break;

        const almacen = safe(row[0]);
        const palletCama = safe(row[1]);
        const articulo = safe(row[2]);
        const codigoAuxiliar = safe(row[3]);
        const descripcion = safe(row[4]);
        const cantRaw = row[5];

        // Fila resumen tipo: [null, 781, 'PIEZA', ...]
        if (!articulo && (safe(row[1]) || safe(row[2]))) {
            const posibleCantidad = Number(row[1]);
            const posibleUnidad = safe(row[2]);

            if (!Number.isNaN(posibleCantidad) && posibleUnidad) {
                totalDescarga = posibleCantidad;
                unidadTotalDescarga = posibleUnidad;
                continue;
            }
        }

        if (!articulo) continue;

        const cantidadEsperada = Number(cantRaw) || 0;

        partidas.push({
            orden_linea: partidas.length + 1,
            almacen,
            pallet_cama: palletCama,
            articulo,
            codigo_auxiliar: codigoAuxiliar,
            descripcion,
            cantidad_esperada: cantidadEsperada,
            columna_a: safe(row[6]),
            columna_b: safe(row[7])
        });
    }

    // Fecha/hora del pie impreso
    const ultimaFila = rows[rows.length - 1] || [];
    const fechaImpresionReporte = safe(ultimaFila[1]);

    return {
        documento: {
            archivo_origen: fileName,
            hoja_origen: sheetName,
            pre_entrada_compra: preEntradaCompra,
            pre_detectado_auto: preDetectado.detectado ? 1 : 0,
            pre_pendiente_correccion: prePendienteCorreccion,
            empresa,
            fecha_documento: fechaDocumento,
            tipo_documento: tipoDocumento,
            estatus_documento: estatusDocumento,
            moneda,
            proveedor,
            referencia,
            concepto,
            observaciones,
            unidad_tipo: unidadTipo,
            carga_tipo: cargaTipo,
            pallets_entrada: palletsEntrada,
            total_descarga: totalDescarga,
            unidad_total_descarga: unidadTotalDescarga,
            fecha_impresion_reporte: fechaImpresionReporte,
            estado_revision: prePendienteCorreccion ? 'pendiente_pre' : 'importado'
        },
        partidas
    };
}

function parseIntelisisWorkbook(filePath, originalName) {
    const workbook = XLSX.readFile(filePath, { cellDates: false });
    const docs = [];

    for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const parsed = parseSheet(ws, sheetName, originalName);

        if (parsed && parsed.partidas.length > 0) {
            docs.push(parsed);
        }
    }

    return docs;
}


// ======================================================
// HTML públicas
// ======================================================
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/monitor.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'monitor.html'));
});

app.get('/registro.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'registro.html'));
});

app.get('/mi-turno.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'mi-turno.html'));
});

app.get('/pre-import.html', requireAuth(['admin', 'operativo']), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pre-import.html'));
});

// ======================================================
// HTML protegidas
// ======================================================
app.get('/recepcion.html', requireAuth(['admin']), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'recepcion.html'));
});

app.get('/admin.html', requireAuth(['admin', 'operativo']), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get(['/bitacora.html', '/bitacoras.html'], requireAuth(['admin', 'oficial']), (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'bitacora.html'));
});

//app.get('/registro.html', requireAuth(['admin', 'registro_operadores']), (req, res) => {
//res.sendFile(path.join(__dirname, 'public', 'registro.html'));
//});

// Archivos estáticos (CSS, JS, imágenes, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// ======================================================
// CREAR TABLAS SI NO EXISTEN
// ======================================================
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS Turnos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folio TEXT,
            nombre_operador TEXT,
            telefono TEXT,
            tipo_unidad TEXT,
            proveedor TEXT,
            placas TEXT,
            tipo_llegada TEXT,
            hora_cita DATETIME,
            hora_llegada DATETIME DEFAULT (datetime('now', 'localtime')),
            carga TEXT,
            cantidad TEXT,
            categoria TEXT,
            estatus TEXT DEFAULT 'En Espera',
            anden TEXT,
            observaciones TEXT,
            hora_inicio_descarga DATETIME,
            hora_fin_descarga DATETIME,
            orden_prioridad INTEGER DEFAULT 0,
            tamano_unidad TEXT DEFAULT 'CHICA',
            prioridad TEXT DEFAULT 'NORMAL',
            tipo_operacion TEXT DEFAULT 'RECEPCION'
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS BitacoraSalidas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            turno_id INTEGER NOT NULL,
            fecha_operacion DATE NOT NULL,

            responsable_recibo TEXT,

            cantidad_reportada TEXT,
            cantidad_ingreso INTEGER,
            cantidad_salida INTEGER,

            concepto TEXT,
            no_dev TEXT,

            estado_bitacora TEXT DEFAULT 'PENDIENTE',
            observaciones_salida TEXT,

            capturado_por TEXT,
            capturado_en DATETIME DEFAULT (datetime('now', 'localtime')),

            FOREIGN KEY (turno_id) REFERENCES Turnos(id)
        )
    `);

    db.run(`
        CREATE INDEX IF NOT EXISTS idx_bitacora_turno_fecha
        ON BitacoraSalidas (turno_id, fecha_operacion)
    `);

    db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS pre_documentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            archivo_origen TEXT,
            hoja_origen TEXT,
            pre_entrada_compra TEXT,
            pre_detectado_auto INTEGER DEFAULT 0,
            pre_pendiente_correccion INTEGER DEFAULT 0,
            empresa TEXT,
            fecha_documento TEXT,
            tipo_documento TEXT,
            estatus_documento TEXT,
            moneda TEXT,
            proveedor TEXT,
            referencia TEXT,
            concepto TEXT,
            observaciones TEXT,
            unidad_tipo TEXT,
            carga_tipo TEXT,
            pallets_entrada TEXT,
            total_descarga REAL,
            unidad_total_descarga TEXT,
            fecha_impresion_reporte TEXT,
            estado_revision TEXT DEFAULT 'importado',
            creado_por TEXT,
            creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
            actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS pre_partidas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pre_documento_id INTEGER NOT NULL,
            orden_linea INTEGER,
            almacen TEXT,
            pallet_cama TEXT,
            articulo TEXT,
            codigo_auxiliar TEXT,
            descripcion TEXT,
            cantidad_esperada REAL,
            columna_a TEXT,
            columna_b TEXT,
            creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (pre_documento_id) REFERENCES pre_documentos(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS turno_pre_documentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            turno_id INTEGER NOT NULL,
            pre_documento_id INTEGER NOT NULL,
            asignado_por TEXT,
            asignado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(turno_id, pre_documento_id),
            FOREIGN KEY (pre_documento_id) REFERENCES pre_documentos(id) ON DELETE CASCADE
        )
    `);

    db.run(`
    CREATE TABLE IF NOT EXISTS turno_pre_partidas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_pre_documento_id INTEGER NOT NULL,
        pre_partida_id INTEGER NOT NULL,

        cantidad_esperada REAL DEFAULT 0,
        cantidad_recibida REAL DEFAULT 0,
        diferencia REAL DEFAULT 0,

        estado_linea TEXT DEFAULT 'pendiente',
        incidencia_tipo TEXT,
        incidencia_observacion TEXT,

        validado_por TEXT,
        validado_en DATETIME,

        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (turno_pre_documento_id) REFERENCES turno_pre_documentos(id) ON DELETE CASCADE,
        FOREIGN KEY (pre_partida_id) REFERENCES pre_partidas(id) ON DELETE CASCADE
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS pre_incidencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_pre_partida_id INTEGER NOT NULL,

        tipo_incidencia TEXT NOT NULL,
        cantidad_afectada REAL DEFAULT 0,
        observacion TEXT,

        evidencia_url TEXT,
        creada_por TEXT,
        creada_en DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (turno_pre_partida_id) REFERENCES turno_pre_partidas(id) ON DELETE CASCADE
    )
`);

db.run(`
    CREATE TABLE IF NOT EXISTS pre_lecturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_pre_partida_id INTEGER NOT NULL,

        tipo_lectura TEXT,
        valor_lectura TEXT,
        cantidad_sumada REAL DEFAULT 1,

        capturado_por TEXT,
        capturado_en DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (turno_pre_partida_id) REFERENCES turno_pre_partidas(id) ON DELETE CASCADE
    )
`);

    db.run(`CREATE INDEX IF NOT EXISTS idx_pre_documentos_pre ON pre_documentos(pre_entrada_compra)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_pre_documentos_proveedor ON pre_documentos(proveedor)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_pre_partidas_documento ON pre_partidas(pre_documento_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_turno_pre_turno ON turno_pre_documentos(turno_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_turno_pre_partidas_doc ON turno_pre_partidas(turno_pre_documento_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_turno_pre_partidas_partida ON turno_pre_partidas(pre_partida_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_pre_incidencias_partida ON pre_incidencias(turno_pre_partida_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_pre_lecturas_partida ON pre_lecturas(turno_pre_partida_id)`);
    
asegurarColumnasTurnoPreDocumentos();
});
});

// fila 592 a la 641 
// ======================================================
// MIGRACIÓN AUTOMÁTICA DE COLUMNAS FALTANTES EN TURNOS
// ======================================================
function asegurarColumnasTurnos() {
    db.all(`PRAGMA table_info(Turnos)`, [], (err, columns) => {
        if (err) {
            console.error('Error al revisar columnas de Turnos:', err.message);
            return;
        }

        const existentes = columns.map(col => col.name);

        const columnasNecesarias = [
            { nombre: 'categoria', definicion: `TEXT` },
            { nombre: 'orden_prioridad', definicion: `INTEGER DEFAULT 0` },
            { nombre: 'tamano_unidad', definicion: `TEXT DEFAULT 'CHICA'` },
            { nombre: 'prioridad', definicion: `TEXT DEFAULT 'NORMAL'` },
            { nombre: 'tipo_operacion', definicion: `TEXT DEFAULT 'RECEPCION'` }
        ];

        columnasNecesarias.forEach(col => {
            if (!existentes.includes(col.nombre)) {
                db.run(
                    `ALTER TABLE Turnos ADD COLUMN ${col.nombre} ${col.definicion}`,
                    (alterErr) => {
                        if (alterErr) {
                            console.error(`Error al agregar columna ${col.nombre}:`, alterErr.message);
                        } else {
                            console.log(`✅ Columna agregada: ${col.nombre}`);
                        }
                    }
                );
            }
        });
    });
}

asegurarColumnasTurnos();

// Asegurar columnas para gestión de PREs en turno_pre_documentos //
function asegurarColumnasTurnoPreDocumentos() {
    db.all(`PRAGMA table_info(turno_pre_documentos)`, [], (err, columns) => {
        if (err) {
            console.error('Error al revisar columnas de turno_pre_documentos:', err.message);
            return;
        }

        const existentes = columns.map(col => col.name);

        const columnasNecesarias = [
            { nombre: 'estado_validacion', definicion: `TEXT DEFAULT 'ligado'` },
            { nombre: 'recibido_por', definicion: `TEXT` },
            { nombre: 'inicio_validacion', definicion: `DATETIME` },
            { nombre: 'fin_validacion', definicion: `DATETIME` },
            { nombre: 'pallets_descargados', definicion: `INTEGER` },
            { nombre: 'observaciones_generales', definicion: `TEXT` },
            { nombre: 'total_esperado', definicion: `REAL DEFAULT 0` },
            { nombre: 'total_recibido', definicion: `REAL DEFAULT 0` },
            { nombre: 'tiene_incidencias', definicion: `INTEGER DEFAULT 0` },
            { nombre: 'firma_recibidor', definicion: `TEXT` }
        ];

        columnasNecesarias.forEach(col => {
            if (!existentes.includes(col.nombre)) {
                db.run(
                    `ALTER TABLE turno_pre_documentos ADD COLUMN ${col.nombre} ${col.definicion}`,
                    (alterErr) => {
                        if (alterErr) {
                            console.error(`Error al agregar columna ${col.nombre} en turno_pre_documentos:`, alterErr.message);
                        } else {
                            console.log(`✅ Columna agregada en turno_pre_documentos: ${col.nombre}`);
                        }
                    }
                );
            }
        });
    });
}

// ======================================================
// HELPERS GENERALES
// ======================================================
function normalizarTexto(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor).trim();
}

function construirCamposDerivadosOError(tipoUnidad) {
    const tipo = normalizarTexto(tipoUnidad);

    if (!tipo) {
        return {
            ok: false,
            error: 'Debes indicar un tipo de unidad válido.'
        };
    }

    const derivados = deriveUnitFields(tipo);

    if (!derivados) {
        return {
            ok: false,
            error: `El tipo de unidad "${tipo}" no está permitido en la configuración del sistema.`
        };
    }

    return {
        ok: true,
        tipo_unidad: tipo,
        ...derivados
    };
}

function validarAndenPorTipo(tipoUnidad, anden) {
    const tipo = String(tipoUnidad || '').toLowerCase().trim();
    const numeroAnden = parseInt(anden, 10);

    if (!tipo || Number.isNaN(numeroAnden)) {
        return { ok: false, error: 'Tipo de unidad o andén inválido.' };
    }

    if (tipo.includes('plataforma') && ![1, 2].includes(numeroAnden)) {
        return {
            ok: false,
            error: 'Las unidades tipo Plataforma solo pueden ir al andén 1 o 2.'
        };
    }

    if ((tipo.includes('caja seca') || tipo.includes('contenedor')) && ![3, 4].includes(numeroAnden)) {
        return {
            ok: false,
            error: 'Las unidades tipo Caja Seca o Contenedor solo pueden ir al andén 3 o 4.'
        };
    }

    return { ok: true };
}

function calcularEstadoLinea(cantidadEsperada, cantidadRecibida, incidenciaTipo) {
    const esperado = Number(cantidadEsperada || 0);
    const recibido = Number(cantidadRecibida || 0);
    const hayIncidencia = !!String(incidenciaTipo || '').trim();

    if (hayIncidencia) return 'con_incidencia';

    if (recibido === 0) return 'pendiente';
    if (recibido < esperado) return 'parcial';
    if (recibido === esperado) return 'validada';
    if (recibido > esperado) return 'con_incidencia';

    return 'pendiente';
}

function recalcularResumenTurnoPre(turnoPreDocumentoId, callback) {
    db.all(
        `
        SELECT *
        FROM turno_pre_partidas
        WHERE turno_pre_documento_id = ?
        `,
        [turnoPreDocumentoId],
        (err, partidas) => {
            if (err) return callback(err);

            const totalEsperado = partidas.reduce((sum, p) => sum + Number(p.cantidad_esperada || 0), 0);
            const totalRecibido = partidas.reduce((sum, p) => sum + Number(p.cantidad_recibida || 0), 0);
            const tieneIncidencias = partidas.some(p =>
                p.estado_linea === 'con_incidencia' || String(p.incidencia_tipo || '').trim()
            ) ? 1 : 0;

            let estadoValidacion = 'en_validacion';

            if (partidas.length > 0) {
                const todasValidadasOSinPendiente = partidas.every(p =>
                    ['validada', 'con_incidencia', 'parcial'].includes(p.estado_linea)
                );

                const todasCerradasLogicamente = partidas.every(p =>
                    ['validada', 'con_incidencia'].includes(p.estado_linea)
                );

                if (tieneIncidencias) {
                    estadoValidacion = 'con_incidencias';
                }

                if (!tieneIncidencias && todasCerradasLogicamente) {
                    estadoValidacion = 'validado';
                }

                if (!todasValidadasOSinPendiente) {
                    estadoValidacion = 'en_validacion';
                }
            }

            db.run(
                `
                UPDATE turno_pre_documentos
                SET
                    total_esperado = ?,
                    total_recibido = ?,
                    tiene_incidencias = ?,
                    estado_validacion = ?
                WHERE id = ?
                `,
                [totalEsperado, totalRecibido, tieneIncidencias, estadoValidacion, turnoPreDocumentoId],
                function (updateErr) {
                    if (updateErr) return callback(updateErr);
                    callback(null, {
                        total_esperado: totalEsperado,
                        total_recibido: totalRecibido,
                        tiene_incidencias: tieneIncidencias,
                        estado_validacion: estadoValidacion
                    });
                }
            );
        }
    );
}

function sembrarTurnoPrePartidas(turnoPreDocumentoId, preDocumentoId, usuario, callback) {
    db.all(
        `
        SELECT *
        FROM pre_partidas
        WHERE pre_documento_id = ?
        ORDER BY orden_linea ASC
        `,
        [preDocumentoId],
        (err, orden_lineaOriginales) => {
            if (err) return callback(err);

            if (!partidasOriginales.length) {
                return callback(null, 0);
            }

            let insertadas = 0;
            let procesadas = 0;

            partidasOriginales.forEach((p) => {
                db.run(
                    `
                    INSERT INTO turno_pre_partidas (
                        turno_pre_documento_id,
                        pre_partida_id,
                        cantidad_esperada,
                        cantidad_recibida,
                        diferencia,
                        estado_linea,
                        validado_por
                    )
                    VALUES (?, ?, ?, 0, 0, 'pendiente', ?)
                    `,
                    [
                        turnoPreDocumentoId,
                        p.id,
                        Number(p.cantidad_esperada || 0),
                        usuario || ''
                    ],
                    function (insertErr) {
                        procesadas++;

                        if (!insertErr) {
                            insertadas++;
                        } else {
                            console.error('Error al sembrar línea operativa PRE:', insertErr.message);
                        }

                        if (procesadas === partidasOriginales.length) {
                            callback(null, insertadas);
                        }
                    }
                );
            });
        }
    );
}

// ======================================================
// HELPERS BITÁCORA
// ======================================================
function extraerFechaOperacion(turno) {
    const fechaBase = turno.hora_llegada || turno.hora_cita;

    if (!fechaBase) {
        return new Date().toISOString().split('T')[0];
    }

    return String(fechaBase).split(' ')[0];
}

function asegurarBitacoraSalida(turno, callback) {
    const turnoId = turno.id;
    const fechaOperacion = extraerFechaOperacion(turno);
    const cantidadReportada = turno.cantidad || '';

    db.get(
        `SELECT id FROM BitacoraSalidas WHERE turno_id = ? AND fecha_operacion = ?`,
        [turnoId, fechaOperacion],
        (err, row) => {
            if (err) return callback(err);

            if (row) {
                return callback(null, row.id);
            }

            db.run(
                `INSERT INTO BitacoraSalidas (
                    turno_id,
                    fecha_operacion,
                    cantidad_reportada,
                    estado_bitacora
                )
                VALUES (?, ?, ?, 'PENDIENTE')`,
                [turnoId, fechaOperacion, cantidadReportada],
                function(insertErr) {
                    if (insertErr) return callback(insertErr);
                    callback(null, this.lastID);
                }
            );
        }
    );
}

// ======================================================
// API: LOGIN / SESIÓN
// ======================================================
app.post('/api/login', (req, res) => {
    const { login, password } = req.body;

    const loginNormalizado = String(login || '').trim().toLowerCase();
    const passwordIngresado = String(password || '').trim();

    if (!loginNormalizado || !passwordIngresado) {
        return res.status(400).json({ error: 'Debes ingresar usuario/correo y contraseña.' });
    }

    const usuarioEncontrado = Object.values(usuarios).find(u => {
        const correo = u.correo ? String(u.correo).trim().toLowerCase() : null;
        const usuario = u.usuario ? String(u.usuario).trim().toLowerCase() : null;

        return correo === loginNormalizado || usuario === loginNormalizado;
    });

    if (!usuarioEncontrado) {
        return res.status(401).json({ error: 'Usuario o correo no encontrado.' });
    }

    if (String(usuarioEncontrado.password || '') !== passwordIngresado) {
        return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    const rolNormalizado = normalizarRol(usuarioEncontrado.rol);

    const user = {
        nombre: usuarioEncontrado.nombre,
        rol: rolNormalizado,
        puesto: usuarioEncontrado.puesto || usuarioEncontrado.rol || '',
        login: usuarioEncontrado.correo || usuarioEncontrado.usuario || '',
        homePage: obtenerHomePagePorRol(rolNormalizado)
    };

    req.session.user = user;

    return res.json({
        success: true,
        user
    });
});

app.get('/api/me', (req, res) => {
    if (!req.session?.user) {
        return res.status(401).json({ error: 'No autenticado' });
    }

    res.json({
        success: true,
        user: req.session.user
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// ======================================================
// API: REORDENAR TARJETAS
// ======================================================
app.post('/api/reordenar', requireApiAuth(['admin']), (req, res) => {
    const { nuevoOrden } = req.body;

    if (!nuevoOrden || nuevoOrden.length === 0) {
        return res.status(200).json({ message: 'Nada que reordenar' });
    }

    let completados = 0;
    let huboError = false;

    nuevoOrden.forEach((id, index) => {
        db.run(
            `UPDATE Turnos SET orden_prioridad = ? WHERE id = ?`,
            [index, id],
            (err) => {
                if (err) {
                    console.error('Error al reordenar ID:', id, err);
                    huboError = true;
                }

                completados++;

                if (completados === nuevoOrden.length) {
                    if (huboError) {
                        return res.status(500).json({ error: 'Error al guardar el orden' });
                    }
                    res.status(200).json({ message: 'Orden actualizado con éxito' });
                }
            }
        );
    });
});

// ======================================================
// API: TURNOS ACTIVOS (pública para monitor)
// ======================================================
app.get('/api/turnos', (req, res) => {
    db.all(
        `
        SELECT
            t.*,
            COUNT(tpd.pre_documento_id) AS total_pre
        FROM Turnos t
        LEFT JOIN turno_pre_documentos tpd
            ON tpd.turno_id = t.id
        WHERE t.estatus NOT IN ('Finalizado', 'Programado')
        GROUP BY t.id
        ORDER BY t.orden_prioridad ASC, t.hora_llegada ASC
        `,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// ======================================================
// API: PROGRAMADOS
// ======================================================

app.get('/api/programados', (req, res) => {
    db.all(
        `SELECT * FROM Turnos
         WHERE estatus = 'Programado'
         ORDER BY hora_cita ASC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// ======================================================
// API: HISTORIAL (pública para monitor)
// ======================================================
app.get('/api/historial', (req, res) => {
    db.all(
        `SELECT * FROM Turnos
         WHERE estatus = 'Finalizado'
         ORDER BY id DESC
         LIMIT 50`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// ======================================================
// API: BUSCAR MI TURNO POR FOLIO O PLACAS
// ======================================================
app.get('/api/mi-turno/buscar', (req, res) => {
    const q = String(req.query.q || '').trim();

    if (!q) {
        return res.status(400).json({ error: 'Debes indicar un folio o placas' });
    }

    db.get(
        `
        SELECT *
        FROM Turnos
        WHERE folio = ?
           OR placas = ?
        ORDER BY id DESC
        LIMIT 1
        `,
        [q, q],
        (err, row) => {
            if (err) {
                console.error('Error al buscar mi turno:', err.message);
                return res.status(500).json({ error: err.message });
            }

            if (!row) {
                return res.status(404).json({ error: 'No se encontró un turno con ese dato' });
            }

            res.json(row);
        }
    );
});

// ======================================================
// API: MI TURNO POR ID
// ======================================================
app.get('/api/mi-turno/:id', (req, res) => {
    const id = req.params.id;

    db.get(
        `SELECT * FROM Turnos WHERE id = ?`,
        [id],
        (err, row) => {
            if (err) {
                console.error('Error al consultar mi turno por id:', err.message);
                return res.status(500).json({ error: err.message });
            }

            if (!row) {
                return res.status(404).json({ error: 'Turno no encontrado' });
            }

            res.json(row);
        }
    );
});

// ======================================================
// API: FABRICANTES
// ======================================================
app.get('/api/fabricantes', (req, res) => {
    res.json(fabricantes);
});

// ======================================================
// API: ACTUALIZAR TURNO
// ======================================================
app.post('/api/actualizar-turno', requireApiAuth(['admin', 'operativo']), (req, res) => {
    const {
        id,
        nuevoEstatus,
        anden,
        marcar_inicio,
        marcar_fin,
        limpiar_fin,
        tipo_unidad
    } = req.body;

    if (!id || !nuevoEstatus) {
        return res.status(400).json({
            error: 'Faltan datos obligatorios: id y nuevoEstatus'
        });
    }

    db.get(`SELECT * FROM Turnos WHERE id = ?`, [id], (err, turnoActual) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        if (!turnoActual) {
            return res.status(404).json({ error: 'Turno no encontrado' });
        }

        const tipoUnidadFinal = normalizarTexto(tipo_unidad) || turnoActual.tipo_unidad;

        const validacionUnidad = construirCamposDerivadosOError(tipoUnidadFinal);
        if (!validacionUnidad.ok) {
            return res.status(400).json({ error: validacionUnidad.error });
        }

        const {
            tipo_unidad: tipoUnidadNormalizada,
            carga,
            tamano_unidad,
            prioridad,
            tipo_operacion
        } = validacionUnidad;

        function ejecutarActualizacionTurno() {
            let query = `
                UPDATE Turnos SET
                    estatus = ?,
                    tipo_unidad = ?,
                    carga = ?,
                    tamano_unidad = ?,
                    prioridad = ?,
                    tipo_operacion = ?
            `;

            const params = [
                nuevoEstatus,
                tipoUnidadNormalizada,
                carga,
                tamano_unidad,
                prioridad,
                tipo_operacion
            ];

            if (anden) {
                query += `, anden = ?`;
                params.push(anden);
            }

            if (marcar_inicio) {
                query += `, hora_inicio_descarga = datetime('now', 'localtime')`;
            }

            if (marcar_fin) {
                query += `, hora_fin_descarga = datetime('now', 'localtime')`;
            }

            if (limpiar_fin) {
                query += `, hora_fin_descarga = NULL`;
            }

            query += ` WHERE id = ?`;
            params.push(id);

            db.run(query, params, function(updateErr) {
                if (updateErr) {
                    return res.status(500).json({ error: updateErr.message });
                }

                io.emit('actualizacion_turnos');
                res.json({ success: true });
            });
        }

        if (nuevoEstatus === 'Proximo a Anden') {
            if (!anden) {
                return res.status(400).json({
                    error: 'Debes indicar el andén para mover la unidad.'
                });
            }

            const validacionAnden = validarAndenPorTipo(tipoUnidadNormalizada, anden);
            if (!validacionAnden.ok) {
                return res.status(409).json({ error: validacionAnden.error });
            }

            db.all(
                `SELECT * FROM Turnos
                 WHERE anden = ?
                   AND estatus IN ('En Descarga', 'Proximo a Anden')
                   AND id != ?`,
                [anden, id],
                (ocupadosErr, ocupados) => {
                    if (ocupadosErr) {
                        return res.status(500).json({ error: ocupadosErr.message });
                    }

                    const numeroAnden = parseInt(anden, 10);

                    if ([1, 2].includes(numeroAnden)) {
                        const slots = ocupados.reduce((sum, t) => {
                            return sum + (t.tamano_unidad === 'GRANDE' ? 2 : 1);
                        }, 0);

                        if (tamano_unidad === 'GRANDE') {
                            if (slots > 0) {
                                return res.status(409).json({
                                    error: `No cabe una unidad grande en el andén ${anden}, ya hay una unidad ocupando espacio.`
                                });
                            }
                        } else {
                            if (slots >= 2) {
                                return res.status(409).json({
                                    error: `Andén ${anden} lleno, máximo dos unidades chicas.`
                                });
                            }
                        }

                        return ejecutarActualizacionTurno();
                    }

                    if ([3, 4].includes(numeroAnden)) {
                        if (ocupados.length >= 1) {
                            return res.status(409).json({
                                error: `El andén ${anden} ya está ocupado.`
                            });
                        }

                        return ejecutarActualizacionTurno();
                    }

                    return res.status(409).json({
                        error: `El andén ${anden} no está contemplado en las reglas del sistema.`
                    });
                }
            );

            return;
        }

        ejecutarActualizacionTurno();
    });
});

// ======================================================
// API: REGISTRAR NUEVO TURNO
// ======================================================
app.post('/api/registrar-turno', (req, res) => {
    const {
        folio,
        nombre_operador,
        telefono,
        tipo_unidad,
        proveedor,
        placas,
        tipo_llegada,
        hora_cita,
        cantidad,
        categoria,
        observaciones
    } = req.body;

    const validacionUnidad = construirCamposDerivadosOError(tipo_unidad);
    if (!validacionUnidad.ok) {
        return res.status(400).json({ error: validacionUnidad.error });
    }

    const {
        tipo_unidad: tipoUnidadFinal,
        carga,
        tamano_unidad,
        prioridad,
        tipo_operacion
    } = validacionUnidad;

    const query = `
        INSERT INTO Turnos (
            folio,
            nombre_operador,
            telefono,
            tipo_unidad,
            proveedor,
            placas,
            tipo_llegada,
            hora_cita,
            carga,
            cantidad,
            categoria,
            observaciones,
            tamano_unidad,
            prioridad,
            tipo_operacion,
            estatus,
            hora_llegada
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'En Espera', datetime('now', 'localtime'))
    `;


const placasFinal = String(placas || '').trim().toUpperCase();


    db.run(
        query,
        [
            folio || '',
            nombre_operador || '',
            telefono || '',
            tipoUnidadFinal,
            proveedor || '',
            placasFinal,
            tipo_llegada || 'No Citado',
            hora_cita || null,
            carga,
            cantidad || '',
            categoria || '',
            observaciones || '',
            tamano_unidad,
            prioridad,
            tipo_operacion
        ],
        function(err) {
            if (err) {
                console.error('Error al guardar:', err.message);
                return res.status(500).json({ error: err.message });
            }

            const nuevoTurnoId = this.lastID;

            db.get(`SELECT * FROM Turnos WHERE id = ?`, [nuevoTurnoId], (getErr, turnoCreado) => {
                if (getErr) {
                    console.error('Error al consultar turno recién creado:', getErr.message);
                    return res.status(500).json({ error: getErr.message });
                }

                asegurarBitacoraSalida(turnoCreado || {}, (bitErr) => {
                    if (bitErr) {
                        console.error('Error al asegurar bitácora:', bitErr.message);
                        return res.status(500).json({ error: bitErr.message });
                    }

                    io.emit('actualizacion_turnos');
                    res.json({ success: true, id: nuevoTurnoId });
                });
            });
        }
    );
});

// ======================================================
// API: MODIFICAR TURNO EXISTENTE
// ======================================================
app.post('/api/modificar-turno', requireApiAuth(['admin']), (req, res) => {
    const {
        id,
        folio,
        nombre_operador,
        telefono,
        tipo_unidad,
        proveedor,
        placas,
        cantidad,
        categoria,
        tipo_llegada,
        hora_cita,
        observaciones,
        estatus
    } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'Falta el ID del turno a modificar' });
    }

    const validacionUnidad = construirCamposDerivadosOError(tipo_unidad);
    if (!validacionUnidad.ok) {
        return res.status(400).json({ error: validacionUnidad.error });
    }

    const {
        tipo_unidad: tipoUnidadFinal,
        carga,
        tamano_unidad,
        prioridad,
        tipo_operacion
    } = validacionUnidad;

    const query = `
        UPDATE Turnos SET
            folio = ?,
            nombre_operador = ?,
            telefono = ?,
            tipo_unidad = ?,
            proveedor = ?,
            placas = ?,
            carga = ?,
            cantidad = ?,
            categoria = ?,
            tipo_llegada = ?,
            hora_cita = ?,
            observaciones = ?,
            estatus = ?,
            tamano_unidad = ?,
            prioridad = ?,
            tipo_operacion = ?,
            hora_llegada = COALESCE(hora_llegada, datetime('now', 'localtime'))
        WHERE id = ?
    `;

    const placasFinal = String(placas || '').trim().toUpperCase();

    db.run(
        query,
        [
            folio || '',
            nombre_operador || '',
            telefono || '',
            tipoUnidadFinal,
            proveedor || '',
            placasFinal,
            carga,
            cantidad || '',
            categoria || '',
            tipo_llegada || 'No Citado',
            hora_cita || null,
            observaciones || '',
            estatus || 'En Espera',
            tamano_unidad,
            prioridad,
            tipo_operacion,
            id
        ],
        function(err) {
            if (err) {
                console.error('Error al modificar:', err.message);
                return res.status(500).json({ error: err.message });
            }

            io.emit('actualizacion_turnos');
            res.json({ success: true });
        }
    );
});

// ======================================================
// API: ELIMINAR REGISTRO
// ======================================================
app.delete('/api/eliminar-turno/:id', requireApiAuth(['admin']), (req, res) => {
    const id = req.params.id;

    db.run(`DELETE FROM BitacoraSalidas WHERE turno_id = ?`, [id], (bitErr) => {
        if (bitErr) {
            console.error('Error al eliminar bitácora del turno:', bitErr.message);
            return res.status(500).json({ error: bitErr.message });
        }

        db.run(`DELETE FROM Turnos WHERE id = ?`, [id], function(err) {
            if (err) {
                console.error('Error al eliminar turno:', err.message);
                return res.status(500).json({ error: err.message });
            }

            io.emit('actualizacion_turnos');
            res.json({ success: true });
        });
    });
});

// ======================================================
// API: CALENDARIO
// ======================================================
app.get('/api/calendario', requireApiAuth(['admin']), (req, res) => {
    db.all(
        `SELECT * FROM Turnos WHERE hora_cita IS NOT NULL OR hora_llegada IS NOT NULL`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// ======================================================
// API: BITÁCORA DEL DÍA
// ======================================================
app.get('/api/bitacora', requireApiAuth(['admin', 'oficial']), (req, res) => {
    const fecha = req.query.fecha || new Date().toISOString().split('T')[0];

    const query = `
        SELECT
            t.id AS turno_id,
            t.hora_llegada,
            t.hora_cita,
            t.hora_inicio_descarga,
            t.hora_fin_descarga,
            t.nombre_operador,
            t.proveedor,
            t.placas,
            t.cantidad,
            t.folio,
            t.tipo_unidad,
            t.categoria,
            t.anden,
            t.estatus,

            b.id AS bitacora_id,
            b.fecha_operacion,
            b.responsable_recibo,
            b.cantidad_reportada,
            b.cantidad_ingreso,
            b.cantidad_salida,
            b.concepto,
            b.no_dev,
            b.estado_bitacora,
            b.observaciones_salida,
            b.capturado_por,
            b.capturado_en

        FROM Turnos t
        LEFT JOIN BitacoraSalidas b
            ON b.turno_id = t.id

        WHERE
            date(COALESCE(t.hora_llegada, t.hora_cita, b.fecha_operacion)) = ?

            OR

            (
                (
                    t.hora_inicio_descarga IS NULL
                    OR t.hora_fin_descarga IS NULL
                    OR t.estatus IN ('En Espera', 'Proximo a Anden', 'En Descarga', 'Programado')
                )
                AND (b.estado_bitacora IS NULL OR b.estado_bitacora != 'FINALIZADA')
            )

        GROUP BY t.id
        ORDER BY
            CASE
                WHEN (b.estado_bitacora IS NULL OR b.estado_bitacora != 'FINALIZADA') THEN 0
                ELSE 1
            END,
            COALESCE(t.hora_llegada, t.hora_cita, b.fecha_operacion) ASC,
            t.id ASC
    `;

    db.all(query, [fecha], (err, rows) => {
        if (err) {
            console.error('Error al consultar bitácora:', err.message);
            return res.status(500).json({ error: err.message });
        }

        res.json(rows);
    });
});

// ======================================================
// API: GUARDAR / EDITAR BITÁCORA DE SALIDA
// ======================================================
app.post('/api/bitacora/guardar', requireApiAuth(['admin', 'oficial']), (req, res) => {
    const {
        turno_id,
        responsable_recibo,
        cantidad_ingreso,
        cantidad_salida,
        concepto,
        no_dev,
        estado_bitacora,
        observaciones_salida
    } = req.body;

    if (!turno_id) {
        return res.status(400).json({ error: 'Falta turno_id' });
    }

    db.get(`SELECT * FROM Turnos WHERE id = ?`, [turno_id], (err, turno) => {
        if (err) {
            console.error('Error al consultar turno para bitácora:', err.message);
            return res.status(500).json({ error: err.message });
        }

        if (!turno) {
            return res.status(404).json({ error: 'Turno no encontrado' });
        }

        const fechaOperacion = extraerFechaOperacion(turno);
        const hoy = new Date().toISOString().split('T')[0];

        if (fechaOperacion !== hoy) {
            return res.status(403).json({
                error: 'Solo se pueden editar registros de bitácora del mismo día.'
            });
        }

        asegurarBitacoraSalida(turno, (bitErr, bitacoraId) => {
            if (bitErr) {
                console.error('Error al asegurar bitácora antes de guardar:', bitErr.message);
                return res.status(500).json({ error: bitErr.message });
            }

            const salidaNum = Number(cantidad_salida ?? 0);
            let conceptoFinal = concepto || '';
            let noDevFinal = no_dev || '';
            let observacionesFinal = observaciones_salida || '';

            if (salidaNum === 0) {
                conceptoFinal = '';
                noDevFinal = '';
                observacionesFinal = 'Sin salida / sin novedad';
            } else {
                if (conceptoFinal === 'SALIDA_OTRO_CLIENTE') {
                    noDevFinal = '';
                    observacionesFinal = '';
                } else if (conceptoFinal === 'DEVOLUCION_COMPRA') {
                    observacionesFinal = '';
                } else if (conceptoFinal === 'OTRA') {
                    noDevFinal = '';
                } else {
                    noDevFinal = '';
                }
            }

            const capturadoPorSesion = req.session?.user?.nombre || '';

            const query = `
                UPDATE BitacoraSalidas SET
                    responsable_recibo = ?,
                    cantidad_reportada = ?,
                    cantidad_ingreso = ?,
                    cantidad_salida = ?,
                    concepto = ?,
                    no_dev = ?,
                    estado_bitacora = ?,
                    observaciones_salida = ?,
                    capturado_por = ?,
                    capturado_en = datetime('now', 'localtime')
                WHERE id = ?
            `;

            db.run(
                query,
                [
                    responsable_recibo || '',
                    turno.cantidad || '',
                    cantidad_ingreso || null,
                    salidaNum,
                    conceptoFinal,
                    noDevFinal,
                    estado_bitacora || 'PENDIENTE',
                    observacionesFinal,
                    capturadoPorSesion,
                    bitacoraId
                ],
                function(updateErr) {
                    if (updateErr) {
                        console.error('Error al guardar bitácora:', updateErr.message);
                        return res.status(500).json({ error: updateErr.message });
                    }

                    io.emit('actualizacion_turnos');
                    res.json({ success: true, bitacora_id: bitacoraId });
                }
            );
        });
    });
});

// ======================================================
// API: DETALLE DE BITÁCORA POR TURNO
// ======================================================
app.get('/api/bitacora/:turnoId', requireApiAuth(['admin', 'oficial']), (req, res) => {
    const turnoId = req.params.turnoId;

    const query = `
        SELECT
            t.id AS turno_id,
            t.hora_llegada,
            t.hora_cita,
            t.hora_inicio_descarga,
            t.hora_fin_descarga,
            t.nombre_operador,
            t.proveedor,
            t.placas,
            t.cantidad,
            t.folio,
            t.tipo_unidad,
            t.categoria,
            t.anden,
            t.estatus,

            b.id AS bitacora_id,
            b.fecha_operacion,
            b.responsable_recibo,
            b.cantidad_reportada,
            b.cantidad_ingreso,
            b.cantidad_salida,
            b.concepto,
            b.no_dev,
            b.estado_bitacora,
            b.observaciones_salida,
            b.capturado_por,
            b.capturado_en

        FROM Turnos t
        LEFT JOIN BitacoraSalidas b
            ON b.turno_id = t.id
        WHERE t.id = ?
        ORDER BY b.fecha_operacion DESC
        LIMIT 1
    `;

    db.get(query, [turnoId], (err, row) => {
        if (err) {
            console.error('Error al consultar detalle de bitácora:', err.message);
            return res.status(500).json({ error: err.message });
        }

        if (!row) {
            return res.status(404).json({ error: 'No se encontró información de bitácora para ese turno' });
        }

        res.json(row);
    });
});




// API: ENDPOINT IMPORTAR A EXCEL //
app.post('/api/pre/importar-excel', upload.single('archivo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Debes subir un archivo Excel' });
        }
        const filePath = req.file.path;
        const originalName = req.file.originalname;
        const documentos = parseIntelisisWorkbook(filePath, originalName);
        if (!documentos.length) {
            fs.unlinkSync(filePath);
            return res.status(400).json({ error: 'No se detectaron documentos válidos en el archivo.' });
        }
        let documentosImportados = 0;
        let partidasImportadas = 0;
        let prePendientes = 0;
        for (const bloque of documentos) {
            const doc = bloque.documento;
            const partidas = bloque.partidas || [];
            const insertDocumentoSql = `
                INSERT INTO pre_documentos (
                    archivo_origen,
                    hoja_origen,
                    pre_entrada_compra,
                    pre_detectado_auto,
                    pre_pendiente_correccion,
                    empresa,
                    fecha_documento,
                    tipo_documento,
                    estatus_documento,
                    moneda,
                    proveedor,
                    referencia,
                    concepto,
                    observaciones,
                    unidad_tipo,
                    carga_tipo,
                    pallets_entrada,
                    total_descarga,
                    unidad_total_descarga,
                    fecha_impresion_reporte,
                    estado_revision,
                    creado_por
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const documentoId = await new Promise((resolve, reject) => {
                db.run(insertDocumentoSql, [
                    doc.archivo_origen,
                    doc.hoja_origen,
                    doc.pre_entrada_compra,
                    doc.pre_detectado_auto,
                    doc.pre_pendiente_correccion,
                    doc.empresa,
                    doc.fecha_documento,
                    doc.tipo_documento,
                    doc.estatus_documento,
                    doc.moneda,
                    doc.proveedor,
                    doc.referencia,
                    doc.concepto,
                    doc.observaciones,
                    doc.unidad_tipo,
                    doc.carga_tipo,
                    doc.pallets_entrada,
                    doc.total_descarga,
                    doc.unidad_total_descarga,
                    doc.fecha_impresion_reporte,
                    doc.estado_revision,
                    (req.session?.user?.nombre || 'Sistema')
                ], function (err) {
                    if (err) return reject(err);
                    resolve(this.lastID);
                });
            });
            documentosImportados++;
            if (doc.pre_pendiente_correccion) prePendientes++;
            const insertPartidaSql = `
                INSERT INTO pre_partidas (
                    pre_documento_id,
                    orden_linea,
                    almacen,
                    pallet_cama,
                    articulo,
                    codigo_auxiliar,
                    descripcion,
                    cantidad_esperada,
                    columna_a,
                    columna_b
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            for (const p of partidas) {
                await new Promise((resolve, reject) => {
                    db.run(insertPartidaSql, [
                        documentoId,
                        p.orden_linea,
                        p.almacen,
                        p.pallet_cama,
                        p.articulo,
                        p.codigo_auxiliar,
                        p.descripcion,
                        p.cantidad_esperada,
                        p.columna_a,
                        p.columna_b
                    ], function (err) {
                        if (err) return reject(err);
                        resolve();
                    });
                });
                partidasImportadas++;
            }
        }
        fs.unlinkSync(filePath);
        return res.json({
            ok: true,
            documentos_importados: documentosImportados,
            partidas_importadas: partidasImportadas,
            pre_pendientes: prePendientes
        });
    } catch (error) {
        console.error('Error al importar Excel PRE:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(500).json({
            error: 'No fue posible importar el archivo Excel.',
            detalle: error.message
        });
    }
});

// ======================================================
// API: ELIMINAR DOCUMENTO PRE
// ======================================================
app.delete('/api/pre/documentos/:id', (req, res) => {
    const documentoId = Number(req.params.id);

    if (!documentoId) {
        return res.status(400).json({ error: 'ID de documento inválido.' });
    }

    // Primero borrar relaciones con turnos
    db.run(
        `DELETE FROM turno_pre_documentos WHERE pre_documento_id = ?`,
        [documentoId],
        function (errRel) {
            if (errRel) {
                console.error('Error al eliminar relaciones del documento PRE:', errRel.message);
                return res.status(500).json({ error: errRel.message });
            }

            // Después borrar partidas
            db.run(
                `DELETE FROM pre_partidas WHERE pre_documento_id = ?`,
                [documentoId],
                function (errPartidas) {
                    if (errPartidas) {
                        console.error('Error al eliminar partidas del documento PRE:', errPartidas.message);
                        return res.status(500).json({ error: errPartidas.message });
                    }

                    // Finalmente borrar encabezado/documento
                    db.run(
                        `DELETE FROM pre_documentos WHERE id = ?`,
                        [documentoId],
                        function (errDoc) {
                            if (errDoc) {
                                console.error('Error al eliminar documento PRE:', errDoc.message);
                                return res.status(500).json({ error: errDoc.message });
                            }

                            return res.json({
                                ok: true,
                                deleted: this.changes
                            });
                        }
                    );
                }
            );
        }
    );
});

// ENDPOINT ENLISTAR DOCUMENTOS //
app.get('/api/pre/documentos', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const estado = String(req.query.estado || '').trim();
    let sql = `
        SELECT
            d.*,
            COUNT(p.id) AS total_partidas
        FROM pre_documentos d
        LEFT JOIN pre_partidas p ON p.pre_documento_id = d.id
        WHERE 1 = 1
    `;
    const params = [];
    if (q) {
        sql += `
            AND (
                LOWER(COALESCE(d.pre_entrada_compra, '')) LIKE ?
                OR LOWER(COALESCE(d.proveedor, '')) LIKE ?
                OR LOWER(COALESCE(d.referencia, '')) LIKE ?
                OR LOWER(COALESCE(d.concepto, '')) LIKE ?
            )
        `;
        params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (estado) {
        sql += ` AND d.estado_revision = ? `;
        params.push(estado);
    }
    sql += `
        GROUP BY d.id
        ORDER BY d.id DESC
    `;
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Error al listar documentos PRE:', err.message);
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});


// Endpoint: detalle del documento //

app.get('/api/pre/documentos/:id', (req, res) => {
    const { id } = req.params;
    db.get(
        `SELECT * FROM pre_documentos WHERE id = ?`,
        [id],
        (err, documento) => {
            if (err) {
                console.error('Error al consultar documento PRE:', err.message);
                return res.status(500).json({ error: err.message });
            }
            if (!documento) {
                return res.status(404).json({ error: 'Documento no encontrado' });
            }
            db.all(
                `
                SELECT *
                FROM pre_partidas
                WHERE pre_documento_id = ?
                ORDER BY orden_linea ASC
                `,
                [id],
                (err2, partidas) => {
                    if (err2) {
                        console.error('Error al consultar partidas PRE:', err2.message);
                        return res.status(500).json({ error: err2.message });
                    }
                    res.json({
                        documento,
                        partidas
                    });
                }
            );
        }
    );
});


// Endpoint: corregir PRE manualmente  //
app.post('/api/pre/documentos/:id/corregir-pre', (req, res) => {
    const { id } = req.params;
    const { pre_entrada_compra } = req.body;
    const preFinal = String(pre_entrada_compra || '').trim().toUpperCase();
    if (!preFinal) {
        return res.status(400).json({ error: 'Debes indicar un PRE válido.' });
    }
    db.run(
        `
        UPDATE pre_documentos
        SET
            pre_entrada_compra = ?,
            pre_pendiente_correccion = 0,
            actualizado_en = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [preFinal, id],
        function (err) {
            if (err) {
                console.error('Error al corregir PRE:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json({
                ok: true,
                updated: this.changes
            });
        }
    );
});

// 10) Endpoint: asignar PRE a un turno //
app.post('/api/pre/asignar-a-turno', (req, res) => {
    const { turno_id, documentos } = req.body;

    const turnoId = Number(turno_id);
    const lista = Array.isArray(documentos) ? documentos.map(Number).filter(Boolean) : [];

    if (!turnoId || !lista.length) {
        return res.status(400).json({ error: 'Debes indicar turno y al menos un documento.' });
    }

    const usuario = req.session?.user?.nombre || 'Sistema';
    let procesados = 0;
    let errores = 0;

    lista.forEach((docId) => {
        db.run(
            `
            INSERT OR IGNORE INTO turno_pre_documentos (turno_id, pre_documento_id, asignado_por)
            VALUES (?, ?, ?)
            `,
            [turnoId, docId, usuario],
            (err) => {
                if (err) {
                    console.error('Error al asignar PRE a turno:', err.message);
                    errores++;
                }

                procesados++;

                if (procesados === lista.length) {
                    if (errores > 0) {
                        return res.status(500).json({
                            error: 'No se pudieron asignar todos los documentos.'
                        });
                    }

                    io.emit('actualizacion_turnos');

                    return res.json({
                        ok: true,
                        turno_id: turnoId,
                        documentos_asignados: lista.length
                    });
                }
            }
        );
    });
});

// Endpoint: listar PRE ligados a una unidad //
app.get('/api/turnos/:id/pre-documentos', (req, res) => {
    const turnoId = Number(req.params.id);
    db.all(
        `
        SELECT
            d.*,
            tpd.asignado_en,
            tpd.asignado_por
        FROM turno_pre_documentos tpd
        INNER JOIN pre_documentos d ON d.id = tpd.pre_documento_id
        WHERE tpd.turno_id = ?
        ORDER BY tpd.asignado_en DESC
        `,
        [turnoId],
        (err, rows) => {
            if (err) {
                console.error('Error al obtener PRE ligados al turno:', err.message);
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        }
    );
});
// fila 2207 
// API: OBTENER PARTIDAS LIGADAS A UN TURNO (UNIDAD EN RAMPA)
app.get('/api/turnos/:id/partidas', async (req, res) => {
    const turnoId = req.params.id;

    if (!turnoId) {
        return res.status(400).json({ error: 'ID de turno no proporcionado' });
    }

    // Consulta SQL: Unimos la tabla de partidas con los documentos 
    // que pertenezcan a este turno en específico.
    const sql = `
        SELECT 
            p.articulo,
            p.descripcion,
            p.codigo_auxiliar,
            p.cantidad_esperada
            -- Si en un futuro agregas el campo de recibido a la BD, lo pones aquí:
            -- , p.cantidad_recibida 
        FROM pre_partidas p
        INNER JOIN pre_documentos d ON p.pre_documento_id = d.id
        WHERE d.id = ?
    `;

    // Si tu relación entre documentos y turnos se llama diferente a "turno_id" en la tabla 
    // "pre_documentos", solo cambia "d.turno_id" por el nombre de tu columna.

    db.all(sql, [turnoId], (err, rows) => {
        if (err) {
            console.error('Error al obtener partidas del turno:', err);
            return res.status(500).json({ error: 'Error interno al consultar las partidas' });
        }
        
        res.json(rows || []);
    });
});

app.post('/api/turnos/:turnoId/pre-documentos/:documentoId/iniciar-validacion', (req, res) => {
    const turnoId = Number(req.params.turnoId);
    const documentoId = Number(req.params.documentoId);
    const usuario = req.session?.user?.nombre || 'Sistema';

    if (!turnoId || !documentoId) {
        return res.status(400).json({ error: 'Turno o documento inválido.' });
    }

    db.get(
        `
        SELECT *
        FROM turno_pre_documentos
        WHERE turno_id = ? AND pre_documento_id = ?
        `,
        [turnoId, documentoId],
        (err, vinculo) => {
            if (err) {
                console.error('Error al consultar vínculo PRE-turno:', err.message);
                return res.status(500).json({ error: err.message });
            }

            if (!vinculo) {
                return res.status(404).json({ error: 'El documento no está ligado a esta unidad.' });
            }

            db.get(
                `
                SELECT COUNT(*) AS total
                FROM turno_pre_partidas
                WHERE turno_pre_documento_id = ?
                `,
                [vinculo.id],
                (countErr, row) => {
                    if (countErr) {
                        console.error('Error al contar líneas operativas PRE:', countErr.message);
                        return res.status(500).json({ error: countErr.message });
                    }

                    const yaSembrado = Number(row?.total || 0) > 0;

                    const continuar = () => {
                        db.run(
                            `
                            UPDATE turno_pre_documentos
                            SET
                                estado_validacion = 'en_validacion',
                                recibido_por = ?,
                                inicio_validacion = COALESCE(inicio_validacion, datetime('now', 'localtime'))
                            WHERE id = ?
                            `,
                            [usuario, vinculo.id],
                            function (updateErr) {
                                if (updateErr) {
                                    console.error('Error al iniciar validación PRE:', updateErr.message);
                                    return res.status(500).json({ error: updateErr.message });
                                }

                                recalcularResumenTurnoPre(vinculo.id, (resumenErr, resumen) => {
                                    if (resumenErr) {
                                        console.error('Error al recalcular resumen PRE:', resumenErr.message);
                                        return res.status(500).json({ error: resumenErr.message });
                                    }

                                    io.emit('actualizacion_turnos');

                                    res.json({
                                        ok: true,
                                        turno_pre_documento_id: vinculo.id,
                                        ya_sembrado: yaSembrado,
                                        resumen
                                    });
                                });
                            }
                        );
                    };

                    if (yaSembrado) {
                        return continuar();
                    }

                    sembrarTurnoPrePartidas(vinculo.id, documentoId, usuario, (seedErr, insertadas) => {
                        if (seedErr) {
                            console.error('Error al sembrar validación PRE:', seedErr.message);
                            return res.status(500).json({ error: seedErr.message });
                        }

                        continuar();
                    });
                }
            );
        }
    );
});


app.get('/api/turnos/:turnoId/pre-documentos/:documentoId/validacion', (req, res) => {
    const turnoId = Number(req.params.turnoId);
    const documentoId = Number(req.params.documentoId);

    if (!turnoId || !documentoId) {
        return res.status(400).json({ error: 'Turno o documento inválido.' });
    }

    db.get(
        `
        SELECT
            tpd.*,
            d.pre_entrada_compra,
            d.proveedor,
            d.referencia,
            d.concepto,
            d.observaciones,
            d.fecha_documento,
            d.unidad_tipo,
            d.carga_tipo,
            d.total_descarga,
            d.unidad_total_descarga
        FROM turno_pre_documentos tpd
        INNER JOIN pre_documentos d ON d.id = tpd.pre_documento_id
        WHERE tpd.turno_id = ? AND tpd.pre_documento_id = ?
        `,
        [turnoId, documentoId],
        (err, documento) => {
            if (err) {
                console.error('Error al consultar validación PRE:', err.message);
                return res.status(500).json({ error: err.message });
            }

            if (!documento) {
                return res.status(404).json({ error: 'No se encontró el documento ligado a esta unidad.' });
            }

            db.all(
                `
                SELECT
                    tpp.*,
                    pp.orden_linea,
                    pp.almacen,
                    pp.pallet_cama,
                    pp.articulo,
                    pp.codigo_auxiliar,
                    pp.descripcion
                FROM turno_pre_partidas tpp
                INNER JOIN pre_partidas pp ON pp.id = tpp.pre_partida_id
                WHERE tpp.turno_pre_documento_id = ?
                ORDER BY pp.orden_linea ASC
                `,
                [documento.id],
                (err2, partidas) => {
                    if (err2) {
                        console.error('Error al consultar líneas operativas PRE:', err2.message);
                        return res.status(500).json({ error: err2.message });
                    }

                    res.json({
                        documento,
                        partidas
                    });
                }
            );
        }
    );
});


app.post('/api/turno-pre-partidas/:id/guardar', (req, res) => {
    const id = Number(req.params.id);
    const {
        cantidad_recibida,
        incidencia_tipo,
        incidencia_observacion
    } = req.body;

    const usuario = req.session?.user?.nombre || 'Sistema';

    if (!id) {
        return res.status(400).json({ error: 'ID de línea inválido.' });
    }

    db.get(
        `SELECT * FROM turno_pre_partidas WHERE id = ?`,
        [id],
        (err, linea) => {
            if (err) {
                console.error('Error al consultar línea PRE operativa:', err.message);
                return res.status(500).json({ error: err.message });
            }

            if (!linea) {
                return res.status(404).json({ error: 'Línea de validación no encontrada.' });
            }

            const recibido = Number(cantidad_recibida || 0);
            const esperado = Number(linea.cantidad_esperada || 0);
            const diferencia = recibido - esperado;
            const incidenciaFinal = String(incidencia_tipo || '').trim();
            const observacionFinal = String(incidencia_observacion || '').trim();

            const estadoLinea = calcularEstadoLinea(esperado, recibido, incidenciaFinal);

            db.run(
                `
                UPDATE turno_pre_partidas
                SET
                    cantidad_recibida = ?,
                    diferencia = ?,
                    estado_linea = ?,
                    incidencia_tipo = ?,
                    incidencia_observacion = ?,
                    validado_por = ?,
                    validado_en = datetime('now', 'localtime')
                WHERE id = ?
                `,
                [
                    recibido,
                    diferencia,
                    estadoLinea,
                    incidenciaFinal,
                    observacionFinal,
                    usuario,
                    id
                ],
                function (updateErr) {
                    if (updateErr) {
                        console.error('Error al guardar línea validada PRE:', updateErr.message);
                        return res.status(500).json({ error: updateErr.message });
                    }

                    recalcularResumenTurnoPre(linea.turno_pre_documento_id, (resumenErr, resumen) => {
                        if (resumenErr) {
                            console.error('Error al recalcular resumen PRE:', resumenErr.message);
                            return res.status(500).json({ error: resumenErr.message });
                        }

                        io.emit('actualizacion_turnos');

                        res.json({
                            ok: true,
                            estado_linea: estadoLinea,
                            diferencia,
                            resumen
                        });
                    });
                }
            );
        }
    );
});

app.post('/api/turno-pre-partidas/:id/incidencia', (req, res) => {
    const id = Number(req.params.id);
    const {
        tipo_incidencia,
        cantidad_afectada,
        observacion
    } = req.body;

    const usuario = req.session?.user?.nombre || 'Sistema';

    if (!id) {
        return res.status(400).json({ error: 'ID de línea inválido.' });
    }

    const tipo = String(tipo_incidencia || '').trim().toLowerCase();
    if (!tipo) {
        return res.status(400).json({ error: 'Debes indicar un tipo de incidencia.' });
    }

    db.get(
        `SELECT * FROM turno_pre_partidas WHERE id = ?`,
        [id],
        (err, linea) => {
            if (err) {
                console.error('Error al consultar línea PRE para incidencia:', err.message);
                return res.status(500).json({ error: err.message });
            }

            if (!linea) {
                return res.status(404).json({ error: 'Línea de validación no encontrada.' });
            }

            const cantidadAfectadaNum = Number(cantidad_afectada || 0);
            const observacionFinal = String(observacion || '').trim();

            db.run(
                `
                INSERT INTO pre_incidencias (
                    turno_pre_partida_id,
                    tipo_incidencia,
                    cantidad_afectada,
                    observacion,
                    creada_por
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                [id, tipo, cantidadAfectadaNum, observacionFinal, usuario],
                function (insertErr) {
                    if (insertErr) {
                        console.error('Error al registrar incidencia PRE:', insertErr.message);
                        return res.status(500).json({ error: insertErr.message });
                    }

                    const estadoLinea = 'con_incidencia';

                    db.run(
                        `
                        UPDATE turno_pre_partidas
                        SET
                            estado_linea = ?,
                            incidencia_tipo = ?,
                            incidencia_observacion = ?,
                            validado_por = ?,
                            validado_en = datetime('now', 'localtime')
                        WHERE id = ?
                        `,
                        [estadoLinea, tipo, observacionFinal, usuario, id],
                        function (updateErr) {
                            if (updateErr) {
                                console.error('Error al marcar línea con incidencia:', updateErr.message);
                                return res.status(500).json({ error: updateErr.message });
                            }

                            recalcularResumenTurnoPre(linea.turno_pre_documento_id, (resumenErr, resumen) => {
                                if (resumenErr) {
                                    console.error('Error al recalcular resumen PRE:', resumenErr.message);
                                    return res.status(500).json({ error: resumenErr.message });
                                }

                                io.emit('actualizacion_turnos');

                                res.json({
                                    ok: true,
                                    incidencia_id: this?.lastID,
                                    resumen
                                });
                            });
                        }
                    );
                }
            );
        }
    );
});


app.post('/api/turno-pre-partidas/:id/lectura', (req, res) => {
    const id = Number(req.params.id);
    const {
        tipo_lectura,
        valor_lectura,
        cantidad_sumada
    } = req.body;

    const usuario = req.session?.user?.nombre || 'Sistema';

    if (!id) {
        return res.status(400).json({ error: 'ID de línea inválido.' });
    }

    db.get(
        `SELECT * FROM turno_pre_partidas WHERE id = ?`,
        [id],
        (err, linea) => {
            if (err) {
                console.error('Error al consultar línea PRE para lectura:', err.message);
                return res.status(500).json({ error: err.message });
            }

            if (!linea) {
                return res.status(404).json({ error: 'Línea de validación no encontrada.' });
            }

            const qty = Number(cantidad_sumada || 1);
            const nuevaCantidad = Number(linea.cantidad_recibida || 0) + qty;
            const diferencia = nuevaCantidad - Number(linea.cantidad_esperada || 0);
            const estadoLinea = calcularEstadoLinea(linea.cantidad_esperada, nuevaCantidad, linea.incidencia_tipo);

            db.run(
                `
                INSERT INTO pre_lecturas (
                    turno_pre_partida_id,
                    tipo_lectura,
                    valor_lectura,
                    cantidad_sumada,
                    capturado_por
                )
                VALUES (?, ?, ?, ?, ?)
                `,
                [
                    id,
                    String(tipo_lectura || 'manual').trim(),
                    String(valor_lectura || '').trim(),
                    qty,
                    usuario
                ],
                function (insertErr) {
                    if (insertErr) {
                        console.error('Error al guardar lectura PRE:', insertErr.message);
                        return res.status(500).json({ error: insertErr.message });
                    }

                    db.run(
                        `
                        UPDATE turno_pre_partidas
                        SET
                            cantidad_recibida = ?,
                            diferencia = ?,
                            estado_linea = ?,
                            validado_por = ?,
                            validado_en = datetime('now', 'localtime')
                        WHERE id = ?
                        `,
                        [nuevaCantidad, diferencia, estadoLinea, usuario, id],
                        function (updateErr) {
                            if (updateErr) {
                                console.error('Error al actualizar línea tras lectura:', updateErr.message);
                                return res.status(500).json({ error: updateErr.message });
                            }

                            recalcularResumenTurnoPre(linea.turno_pre_documento_id, (resumenErr, resumen) => {
                                if (resumenErr) {
                                    console.error('Error al recalcular resumen PRE:', resumenErr.message);
                                    return res.status(500).json({ error: resumenErr.message });
                                }

                                io.emit('actualizacion_turnos');

                                res.json({
                                    ok: true,
                                    cantidad_recibida: nuevaCantidad,
                                    diferencia,
                                    estado_linea: estadoLinea,
                                    resumen
                                });
                            });
                        }
                    );
                }
            );
        }
    );
});

app.post('/api/turnos/:turnoId/pre-documentos/:documentoId/cerrar-validacion', (req, res) => {
    const turnoId = Number(req.params.turnoId);
    const documentoId = Number(req.params.documentoId);

    const {
        pallets_descargados,
        observaciones_generales,
        firma_recibidor
    } = req.body;

    const usuario = req.session?.user?.nombre || 'Sistema';

    if (!turnoId || !documentoId) {
        return res.status(400).json({ error: 'Turno o documento inválido.' });
    }

    db.get(
        `
        SELECT *
        FROM turno_pre_documentos
        WHERE turno_id = ? AND pre_documento_id = ?
        `,
        [turnoId, documentoId],
        (err, vinculo) => {
            if (err) {
                console.error('Error al consultar vínculo PRE-turno:', err.message);
                return res.status(500).json({ error: err.message });
            }

            if (!vinculo) {
                return res.status(404).json({ error: 'El documento no está ligado a esta unidad.' });
            }

            recalcularResumenTurnoPre(vinculo.id, (resumenErr, resumen) => {
                if (resumenErr) {
                    console.error('Error al recalcular resumen antes de cerrar:', resumenErr.message);
                    return res.status(500).json({ error: resumenErr.message });
                }

                const estadoFinal =
                    resumen.tiene_incidencias ? 'con_incidencias' : 'validado';

                db.run(
                    `
                    UPDATE turno_pre_documentos
                    SET
                        estado_validacion = ?,
                        fin_validacion = datetime('now', 'localtime'),
                        recibido_por = COALESCE(recibido_por, ?),
                        pallets_descargados = ?,
                        observaciones_generales = ?,
                        firma_recibidor = ?
                    WHERE id = ?
                    `,
                    [
                        estadoFinal,
                        usuario,
                        Number(pallets_descargados || 0),
                        String(observaciones_generales || '').trim(),
                        String(firma_recibidor || '').trim(),
                        vinculo.id
                    ],
                    function (updateErr) {
                        if (updateErr) {
                            console.error('Error al cerrar validación PRE:', updateErr.message);
                            return res.status(500).json({ error: updateErr.message });
                        }

                        io.emit('actualizacion_turnos');

                        res.json({
                            ok: true,
                            estado_validacion: estadoFinal,
                            resumen
                        });
                    }
                );
            });
        }
    );
}); 


// Endpoint: desasignar PRE de una unidad//
app.delete('/api/turnos/:turnoId/pre-documentos/:documentoId', (req, res) => {
    const turnoId = Number(req.params.turnoId);
    const documentoId = Number(req.params.documentoId);
    db.run(
        `
        DELETE FROM turno_pre_documentos
        WHERE turno_id = ? AND pre_documento_id = ?
        `,
        [turnoId, documentoId],
        function (err) {
            if (err) {
                console.error('Error al desasignar PRE del turno:', err.message);
                return res.status(500).json({ error: err.message });
            }
            io.emit('actualizacion_turnos');
            res.json({
                ok: true,
                deleted: this.changes
            });
        }
    );
});


// ======================================================
// API: WEBHOOK BOOKINGS (pública)
// ======================================================
app.post('/api/webhook-cita', (req, res) => {
    const { placas, proveedor, hora_cita, folio } = req.body;
    const textoCompleto = typeof placas === 'string' ? placas : JSON.stringify(placas);

    let placasEx = 'Revisar';
    let operadorEx = '';
    let telefonoEx = '';
    let proveedorEx = proveedor || '';
    let tipoUnidadEx = '';
    let folioEx = folio || '';

    if (proveedor && proveedor.includes('-')) {
        const partes = proveedor.split('-');
        tipoUnidadEx = partes[0].trim();
        proveedorEx = partes[1] ? partes[1].trim() : proveedor;
    }

    if (textoCompleto && (textoCompleto.includes('Question') || textoCompleto.includes('Pregunta'))) {
        const extraerDato = (texto, clave) => {
            const regex = new RegExp(`${clave}[\\s\\S]*?(?:Answer|Respuesta|Responder)\\s*-\\s*([^\\\\\\r\\n"]+)`, 'i');
            const coincidencia = texto.match(regex);
            return coincidencia ? coincidencia[1].replace(/<[^>]*>?/gm, '').trim() : null;
        };

        placasEx = extraerDato(textoCompleto, 'placa') || placasEx;
        operadorEx = extraerDato(textoCompleto, 'operador') || operadorEx;
        telefonoEx = extraerDato(textoCompleto, 'celular') || telefonoEx;
        proveedorEx = extraerDato(textoCompleto, 'Fabricante') || proveedorEx;
        folioEx = extraerDato(textoCompleto, 'folio') || extraerDato(textoCompleto, 'orden') || folioEx;
    }

    let cargaEx = '';
    let tamanoUnidadEx = 'CHICA';
    let prioridadEx = 'NORMAL';
    let tipoOperacionEx = 'RECEPCION';

    if (tipoUnidadEx && isValidUnitType(tipoUnidadEx)) {
        const derivados = deriveUnitFields(tipoUnidadEx);
        cargaEx = derivados.carga;
        tamanoUnidadEx = derivados.tamano_unidad;
        prioridadEx = derivados.prioridad;
        tipoOperacionEx = derivados.tipo_operacion;
    } else {
        tipoUnidadEx = '';
    }

    const fechaFmt = hora_cita ? hora_cita.replace('T', ' ').substring(0, 19) : null;

    const query = `
        INSERT INTO Turnos (
            folio,
            nombre_operador,
            telefono,
            tipo_unidad,
            proveedor,
            placas,
            tipo_llegada,
            hora_cita,
            carga,
            estatus,
            tamano_unidad,
            prioridad,
            tipo_operacion
        )
        VALUES (?, ?, ?, ?, ?, ?, 'Citado', ?, ?, 'Programado', ?, ?, ?)
    `;

    db.run(
        query,
        [
            folioEx,
            operadorEx,
            telefonoEx,
            tipoUnidadEx,
            proveedorEx,
            placasEx,
            fechaFmt,
            cargaEx,
            tamanoUnidadEx,
            prioridadEx,
            tipoOperacionEx
        ],
        function(err) {
            if (err) {
                console.error('Error en Webhook:', err.message);
                return res.status(500).json({ error: err.message });
            }

            const nuevoTurnoId = this.lastID;

            db.get(`SELECT * FROM Turnos WHERE id = ?`, [nuevoTurnoId], (getErr, turnoCreado) => {
                if (getErr) {
                    console.error('Error al consultar turno recién creado desde webhook:', getErr.message);
                    return res.status(500).json({ error: getErr.message });
                }

                asegurarBitacoraSalida(turnoCreado || {}, (bitErr) => {
                    if (bitErr) {
                        console.error('Error al asegurar bitácora desde webhook:', bitErr.message);
                        return res.status(500).json({ error: bitErr.message });
                    }

                    io.emit('actualizacion_turnos');
                    res.status(200).json({ success: true, id: nuevoTurnoId });
                });
            });
        }
    );
});

// ======================================================
// SOCKETS
// ======================================================
io.on('connection', () => {
    console.log('Cliente conectado');
});

// ======================================================
// SERVIDOR
// ======================================================
server.listen(3000, () => {
    console.log('✅ Servidor en puerto 3000');
});
