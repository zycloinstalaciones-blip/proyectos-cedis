const socket = io();
let listaTurnosRecepcion = [];

if (!window.AzUtils) {
    console.error("AzUtils no está disponible. Verifica que /js/shared-config.js cargue antes que recepcion.js");
}

if (!window.AzUI) {
    console.error("AzUI no está disponible. Verifica que /js/shared-ui-config.js cargue antes que recepcion.js");
}

if (!window.AzStatus) {
    console.error("AzStatus no está disponible. Verifica que /js/shared-status-config.js cargue antes que recepcion.js");
}

// Detectar cambio de categoría
document.getElementById('categoria').addEventListener('change', async () => {
    await window.AzUtils.fillProveedorSelect({
        categoriaSelector: '#categoria',
        proveedorSelector: '#proveedor'
    });
});

// Detectar cambio de unidad
document.getElementById('tipo_unidad').addEventListener('change', () => {
    window.AzUtils.applyUnitConfig({
        tipoUnidadSelector: '#tipo_unidad',
        cargaSelector: '#carga'
    });
});

// Cargar fabricantes al abrir el modal
window.abrirModalNuevo = async function() {
    document.getElementById('form-registro').reset();
    document.getElementById('turno-id').value = '';

    document.getElementById('titulo-form').innerText = "Registrar Nueva Llegada";
    document.getElementById('btn-guardar').innerText = "Registrar Entrada a Patio";
    document.getElementById('btn-guardar').style.backgroundColor = "#005baa";

    document.getElementById('modal-registro').style.display = 'flex';

    await window.AzUtils.fillProveedorSelect({
        categoriaSelector: '#categoria',
        proveedorSelector: '#proveedor'
    });

    window.AzUtils.applyUnitConfig({
        tipoUnidadSelector: '#tipo_unidad',
        cargaSelector: '#carga'
    });
};

function obtenerFechaVisible(turno) {
    const estatus = String(turno.estatus || '').trim();
    if (estatus === 'Programado') {
        return turno.hora_cita || turno.hora_llegada || '';
    }
    return turno.hora_llegada || turno.hora_cita || '';
}


// ================= CARGAR LA TABLA CON BUSCADOR GLOBAL =================
async function cargarTabla() {
    try {
        const resActivas = await fetch('/api/turnos');
        const activas = await resActivas.json();

        const resHistorial = await fetch('/api/historial');
        const historial = await resHistorial.json();

        const resProgramados = await fetch('/api/programados');
        const programados = await resProgramados.json();

        listaTurnosRecepcion = [...activas, ...historial, ...programados];

        const tbody = document.getElementById('tabla-recepcion');
        tbody.innerHTML = '';

        const filtroFecha = document.getElementById('filtroFechaCaseta') ? document.getElementById('filtroFechaCaseta').value : 'todos';
        const filtroEstado = document.getElementById('filtroEstadoCaseta') ? document.getElementById('filtroEstadoCaseta').value : 'todas';
        const queryGlobal = document.getElementById('busquedaGlobalCaseta') ? document.getElementById('busquedaGlobalCaseta').value.toLowerCase().trim() : '';

        const hoyStr = new Date().toISOString().split('T')[0];
        let turnosMostrar = listaTurnosRecepcion;

        if (queryGlobal.length >= 2) {
            turnosMostrar = listaTurnosRecepcion.filter(t =>
                (t.proveedor && t.proveedor.toLowerCase().includes(queryGlobal)) ||
                (t.nombre_operador && t.nombre_operador.toLowerCase().includes(queryGlobal)) ||
                (t.telefono && t.telefono.toLowerCase().includes(queryGlobal)) ||
                (t.placas && t.placas.toLowerCase().includes(queryGlobal)) ||
                (t.folio && t.folio.toLowerCase().includes(queryGlobal))
            );
        } else {
            if (filtroEstado === 'activas') {
                turnosMostrar = turnosMostrar.filter(t =>
                    t.estatus === 'En Espera' ||
                    t.estatus === 'En Descarga' ||
                    t.estatus === 'Proximo a Anden'
                );
            } else if (filtroEstado === 'concluidas') {
                turnosMostrar = turnosMostrar.filter(t => t.estatus === 'Finalizado');
            } else if (filtroEstado === 'programadas') {
                turnosMostrar = turnosMostrar.filter(t => t.estatus === 'Programado');
            } else {
                if (filtroFecha !== 'hoy') {
                    turnosMostrar = turnosMostrar.filter(t => t.estatus !== 'Finalizado');
                }
            }

            if (filtroFecha === 'hoy') {
                turnosMostrar = turnosMostrar.filter(t => {
                const fechaDato = obtenerFechaVisible(t);
                return fechaDato && (fechaDato.startsWith(hoyStr) || new Date(fechaDato.replace(' ', 'T')) < new Date());
                });
            }
        }

        turnosMostrar.sort((a, b) => {
            const fechaA = obtenerFechaVisible(a);
            const fechaB = obtenerFechaVisible(b);
            if (!fechaA && !fechaB) return 0;
            if (!fechaA) return 1;
            if (!fechaB) return -1;
            return new Date(fechaA.replace(' ', 'T')) - new Date(fechaB.replace(' ', 'T'));
        });

        turnosMostrar.forEach(t => {
            const visualCategoria = window.AzUI.getCategoryVisual(t.categoria);
            const colorCategoria = visualCategoria.color;

            const statusVisual = window.AzStatus.getRecepcionStatusVisual(t);

            let botonAccion = '';

            const btnEliminar = `<button style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer;" onclick="eliminarRegistro(${t.id})" title="Eliminar Registro">🗑️</button>`;

            switch (t.estatus) {
                case 'Finalizado':
                    botonAccion = `<div style="display:flex; gap:5px; align-items:center; justify-content:center;"><span style="color:#9ca3af; font-size:0.85rem; font-weight:bold; flex:1;">Concluido</span>${btnEliminar}</div>`;
                    break;

                case 'Programado':
                    botonAccion = `<div style="display:flex; gap:5px; align-items:center;"><button class="btn-editar" style="flex:1;" onclick="prepararEdicion(${t.id})">Editar</button>${btnEliminar}</div>`;
                    break;

                case 'En Descarga':
                case 'Proximo a Anden':
                    botonAccion = `<div style="display:flex; gap:5px; align-items:center;"><button class="btn-editar" style="flex:1;" onclick="prepararEdicion(${t.id})">Controlar</button>${btnEliminar}</div>`;
                    break;

                case 'En Espera':
                default:
                    botonAccion = `<div style="display:flex; gap:5px; align-items:center;"><button class="btn-editar" style="flex:1;" onclick="prepararEdicion(${t.id})">Editar</button>${btnEliminar}</div>`;
                    break;
            }

            tbody.innerHTML += `
                <tr style="${statusVisual.filaEstilo} border-bottom: 1px solid #e5e7eb; border-left: 6px solid ${colorCategoria};">
                    <td>
                        <span style="color:#e91e63; font-weight:700; font-family:monospace;">${t.folio || 'SIN FOLIO'}</span><br>
                        <strong>${t.nombre_operador || 'Pendiente'}</strong><br>
                        <small style="color:#4b5563; font-weight: 500;">📞 ${t.telefono || 'Sin Teléfono'}</small>
                    </td>
                    <td>
                        ${t.tipo_unidad || '-'}<br>
                        <strong style="font-family:monospace; color:#005baa; font-size:0.95rem;">${t.placas || '-'}</strong>
                    </td>
                    <td><span style="text-transform: uppercase; font-size:0.85rem; font-weight:600;">${t.proveedor || '-'}</span></td>
                    <td>${t.carga || '-'} ${(t.amount || t.cantidad) ? '(' + (t.amount || t.cantidad) + ')' : ''}</td>
                    <td>
                        <span style="font-size:0.85rem; font-weight:500; color:#374151;"> ${t.tipo_llegada || 'Cita'} </span>
                        <br> 
                        <small style="color:#6b7280;">Llegada ${obtenerFechaVisible(t) || '-'}</small>
                    </td>
                    <td style="vertical-align: middle;">
                        ${statusVisual.badgeHTML}
                        ${t.estatus === 'Finalizado' && t.hora_inicio_descarga && t.hora_fin_descarga ?
                            `<div style="color:#166534; font-size:0.75rem; font-weight:bold; margin-top:5px;">
                                ⏱️ Descarga: ${Math.round((new Date(t.hora_fin_descarga.replace(' ', 'T')) - new Date(t.hora_inicio_descarga.replace(' ', 'T'))) / 60000)} min
                            </div>`
                            : ''
                        }
                    </td>
                    <td style="vertical-align: middle;">${botonAccion}</td>
                </tr>
            `;
        });

        if (turnosMostrar.length === 0 && queryGlobal.length >= 2) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#ef4444; font-weight:bold;">🔍 No se encontró ningún registro que coincida con "${queryGlobal}" en todo el sistema.</td></tr>`;
        }

    } catch (error) {
        console.error("Error al cargar la tabla de recepción:", error);
    }
}

window.cerrarModal = function() {
    document.getElementById('modal-registro').style.display = 'none';
    document.getElementById('form-registro').reset();
    document.getElementById('turno-id').value = '';
};

window.prepararEdicion = async function(id) {
    const t = listaTurnosRecepcion.find(x => x.id === id);
    if (!t) return;

    document.getElementById('turno-id').value = t.id;
    document.getElementById('folio').value = t.folio || '';
    document.getElementById('nombre_operador').value = t.nombre_operador || '';
    document.getElementById('telefono').value = t.telefono || '';
    document.getElementById('tipo_unidad').value = t.tipo_unidad || 'Camioneta Granel';
    document.getElementById('categoria').value = t.categoria || 'GENERAL';
    document.getElementById('placas').value = t.placas || '';
    document.getElementById('cantidad').value = t.amount || t.cantidad || '';
    document.getElementById('tipo_llegada').value = t.tipo_llegada || 'No Citado';
    document.getElementById('hora_cita').value = t.hora_cita ? t.hora_cita.replace(' ', 'T').substring(0, 16) : '';
    document.getElementById('observaciones').value = t.observaciones || '';

    window.AzUtils.applyUnitConfig({
        tipoUnidadSelector: '#tipo_unidad',
        cargaSelector: '#carga'
    });

    await window.AzUtils.fillProveedorSelect({
        categoriaSelector: '#categoria',
        proveedorSelector: '#proveedor',
        preserveValue: t.proveedor || ''
    });

    document.getElementById('titulo-form').innerText = "Modificar Datos de Unidad";
    document.getElementById('btn-guardar').innerText = "Guardar Cambios";
    document.getElementById('btn-guardar').style.backgroundColor = "#E91E63";

    document.getElementById('modal-registro').style.display = 'flex';
};

// ================= ENVÍO DEL FORMULARIO =================
document.getElementById('form-registro').addEventListener('submit', async (e) => {
    e.preventDefault();

    const categoria = document.getElementById('categoria').value.trim();
    const proveedor = document.getElementById('proveedor').value.trim();
    const tipoUnidad = document.getElementById('tipo_unidad').value.trim();
    const placas = document.getElementById('placas').value.trim();
    const nombre_operador = document.getElementById('nombre_operador').value.trim();

    const configUnidad = window.AzUtils.getUnitConfig(tipoUnidad);
    const carga = configUnidad ? configUnidad.carga : '';

    if (!categoria) {
        alert("❌ Debes seleccionar una Categoría / Área de Destino");
        return;
    }

    if (!proveedor) {
        alert("❌ Debes seleccionar un Proveedor");
        return;
    }

    if (!tipoUnidad) {
        alert("❌ Debes seleccionar un Tipo de Unidad");
        return;
    }

    if (!configUnidad) {
        alert("❌ El tipo de unidad seleccionado no tiene configuración válida.");
        return;
    }

    if (!placas) {
        alert("❌ Debes ingresar las Placas");
        return;
    }

    if (!nombre_operador) {
        alert("❌ Debes ingresar el Nombre del Operador");
        return;
    }

    if (!carga) {
        alert("❌ No se pudo definir automáticamente el tipo de carga.");
        return;
    }

    const id = document.getElementById('turno-id').value;
    const btn = document.getElementById('btn-guardar');
    const alerta = document.getElementById('mensaje-exito');

    btn.innerText = "Guardando...";
    btn.disabled = true;

    let estatusActual = 'En Espera';
    if (id) {
        const turnoExistente = listaTurnosRecepcion.find(x => x.id == id);
        if (turnoExistente) estatusActual = turnoExistente.estatus;
    }

    const tipo_operacion = "RECEPCION";
    const prioridad = configUnidad.prioridad;
    const tamano_unidad = configUnidad.tamano_unidad;

    const datos = {
        folio: document.getElementById('folio').value,
        nombre_operador: document.getElementById('nombre_operador').value,
        telefono: document.getElementById('telefono').value,
        tipo_unidad: tipoUnidad,
        proveedor: document.getElementById('proveedor').value,
        placas: document.getElementById('placas').value,
        carga: carga,
        cantidad: document.getElementById('cantidad').value,
        categoria: document.getElementById('categoria').value,
        tipo_llegada: document.getElementById('tipo_llegada').value,
        hora_cita: document.getElementById('hora_cita').value
            ? document.getElementById('hora_cita').value.replace('T', ' ') + ':00'
            : null,
        observaciones: document.getElementById('observaciones').value,
        tamano_unidad: tamano_unidad,
        estatus: estatusActual,
        tipo_operacion: tipo_operacion,
        prioridad: prioridad
    };

    try {
        const url = id ? '/api/modificar-turno' : '/api/registrar-turno';
        if (id) datos.id = id;

        const respuesta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        if (respuesta.ok) {
            alerta.innerText = id ? "¡Datos actualizados con éxito!" : "¡Unidad registrada con éxito!";
            alerta.style.display = "block";

            setTimeout(() => {
                alerta.style.display = "none";
                cerrarModal();
            }, 1200);
        }
    } catch (error) {
        console.error("Error:", error);
        alert("Error de conexión.");
    } finally {
        btn.disabled = false;
        if (document.getElementById('turno-id').value) btn.innerText = "Guardar Cambios";
        else btn.innerText = "Registrar Entrada a Patio";
    }
});

// ================= ELIMINAR REGISTROS =================
window.eliminarRegistro = async function(id) {
    if (!confirm("⚠️ ¿Estás seguro de que deseas ELIMINAR este registro por completo?\n\nEsta acción borrará la unidad de la base de datos y no se puede deshacer.")) {
        return;
    }

    try {
        const respuesta = await fetch(`/api/eliminar-turno/${id}`, {
            method: 'DELETE'
        });

        if (respuesta.ok) {
            console.log("Registro eliminado correctamente.");
        } else {
            alert("Hubo un error al intentar eliminar el registro.");
        }
    } catch (error) {
        console.error("Error al eliminar:", error);
        alert("Fallo de conexión con el servidor al intentar borrar.");
    }
};

cargarTabla();
socket.on('actualizacion_turnos', cargarTabla);