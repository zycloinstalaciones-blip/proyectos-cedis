const socket = io();

let registrosBitacora = [];
let registroActivo = null;
let usuarioSesion = null;

// ========================================
// HELPERS
// ========================================
function hoyISO() {
    return new Date().toISOString().split('T')[0];
}

function formatearSoloHora(valor) {
    if (!valor) return '-';
    const partes = String(valor).split(' ');
    if (partes[1]) return partes[1].substring(0, 5);
    return valor;
}

function obtenerClaseFilaBitacora(estadoBitacora) {
    switch ((estadoBitacora || 'PENDIENTE').toUpperCase()) {
        case 'FINALIZADA':
            return 'fila-bitacora-finalizada';
        case 'PENDIENTE':
        default:
            return 'fila-bitacora-pendiente';
    }
}

function obtenerBadgeBitacora(estado) {
    switch ((estado || 'PENDIENTE').toUpperCase()) {
        case 'FINALIZADA':
            return `<span class="badge-mini badge-bitacora-finalizada">Finalizada</span>`;
        case 'PENDIENTE':
        default:
            return `<span class="badge-mini badge-bitacora-pendiente">Pendiente</span>`;
    }
}

function limpiarCamposDependientes() {
    const conceptoEl = document.getElementById('modalConcepto');
    const noDevEl = document.getElementById('modalNoDev');
    const observEl = document.getElementById('modalObservaciones');

    if (conceptoEl) conceptoEl.value = '';
    if (noDevEl) noDevEl.value = '';
    if (observEl) observEl.value = '';
}

function obtenerValorNumerico(idCampo) {
    const valor = document.getElementById(idCampo)?.value ?? '';
    if (valor === '' || valor === null || valor === undefined) return 0;
    return Number(valor);
}

// ========================================
// SESIÓN
// ========================================
async function cargarUsuarioSesion() {
    try {
        const res = await fetch('/api/me', {
            credentials: 'same-origin'
        });

        if (!res.ok) {
            usuarioSesion = null;
            return;
        }

        const data = await res.json();
        usuarioSesion = data.user || null;

        // Si todavía existe el input viejo de capturadoPor, lo rellenamos y deshabilitamos
        const inputCapturado = document.getElementById('capturadoPor');
        if (inputCapturado) {
            inputCapturado.value = usuarioSesion?.nombre || '';
            inputCapturado.disabled = true;
            inputCapturado.placeholder = usuarioSesion?.nombre || 'Usuario logueado';
        }
    } catch (error) {
        console.error('Error al consultar sesión del usuario:', error);
        usuarioSesion = null;
    }
}

// ========================================
// CARGAR BITÁCORA
// ========================================
async function cargarBitacora() {
    const fecha = document.getElementById('filtroFechaBitacora').value || hoyISO();

    try {
        const res = await fetch(`/api/bitacora?fecha=${fecha}`);
        const data = await res.json();

        registrosBitacora = Array.isArray(data) ? data : [];
        aplicarFiltrosYRender();
    } catch (error) {
        console.error("Error al cargar bitácora:", error);
        AzToast.error("No se pudo cargar la bitácora.", {
            title: 'Error de carga'
        });
        const tbody = document.getElementById('tablaBitacoraBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" class="mensaje-vacio">Error al cargar la bitácora.</td></tr>`;
        }
    }
}

// ========================================
// FILTROS + RESUMEN
// ========================================
function aplicarFiltrosYRender() {
    const query = (document.getElementById('busquedaBitacora').value || '').toLowerCase().trim();
    const filtroEstado = document.getElementById('filtroEstadoBitacora').value;

    let filtrados = [...registrosBitacora];

    if (query.length >= 1) {
        filtrados = filtrados.filter(r =>
            (r.nombre_operador && r.nombre_operador.toLowerCase().includes(query)) ||
            (r.proveedor && r.proveedor.toLowerCase().includes(query)) ||
            (r.placas && r.placas.toLowerCase().includes(query)) ||
            (r.folio && r.folio.toLowerCase().includes(query))
        );
    }

    if (filtroEstado !== 'todos') {
        filtrados = filtrados.filter(r => (r.estado_bitacora || 'PENDIENTE') === filtroEstado);
    }

    actualizarResumen(filtrados);
    renderizarBitacora(filtrados);
}

function actualizarResumen(rows) {
    const total = rows.length;
    const pendientes = rows.filter(r => (r.estado_bitacora || 'PENDIENTE') === 'PENDIENTE').length;
    const finalizadas = rows.filter(r => (r.estado_bitacora || '') === 'FINALIZADA').length;

    document.getElementById('resTotal').innerText = total;
    document.getElementById('resPendiente').innerText = pendientes;
    document.getElementById('resFinalizada').innerText = finalizadas;
}

// ========================================
// TABLA
// ========================================
function renderizarBitacora(rows) {
    const tbody = document.getElementById('tablaBitacoraBody');

    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="mensaje-vacio">No hay registros para la fecha seleccionada.</td></tr>`;
        return;
    }

    const fechaFiltro = document.getElementById('filtroFechaBitacora').value || hoyISO();
    const editableHoy = fechaFiltro === hoyISO();

    tbody.innerHTML = rows.map((r, index) => {
        const estadoBitacora = r.estado_bitacora || 'PENDIENTE';
        const finalizada = estadoBitacora === 'FINALIZADA';

        let acciones = '';

        if (editableHoy) {
            acciones = `
                <button class="btn-fila btn-editar" onclick="abrirModalBitacora(${r.turno_id}, 'editar')">Editar</button>
                ${!finalizada ? `<button class="btn-fila btn-finalizar" onclick="abrirModalBitacora(${r.turno_id}, 'finalizar')">Finalizar</button>` : ''}
            `;
        } else {
            acciones = `<button class="btn-fila btn-ver" onclick="abrirModalBitacora(${r.turno_id}, 'ver')">Ver</button>`;
        }

        const subnotaProveedor = (Number(r.cantidad_salida ?? 0) === 0 && (r.observaciones_salida || '') === 'Sin salida / sin novedad')
            ? `<span class="subnota-fila">Sin salida / sin novedad</span>`
            : '';

        return `
            <tr class="${obtenerClaseFilaBitacora(estadoBitacora)}">
                <td class="celda-centro celda-auto">${index + 1}</td>
                <td class="celda-centro celda-auto">${formatearSoloHora(r.hora_llegada)}</td>
                <td class="celda-centro celda-auto">${formatearSoloHora(r.hora_cita)}</td>
                <td class="celda-centro celda-auto">${formatearSoloHora(r.hora_inicio_descarga)}</td>
                <td class="celda-centro celda-auto">${formatearSoloHora(r.hora_fin_descarga)}</td>
                <td class="celda-operador">${r.nombre_operador || '-'}</td>
                <td class="celda-auto">${r.placas || '-'}</td>
                <td class="celda-proveedor">
                    ${r.proveedor || '-'}
                    ${subnotaProveedor}
                </td>
                <td class="celda-folio">${r.folio || '-'}</td>
                <td>
                    <div class="acciones-tabla">
                        ${acciones}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// ========================================
// MODAL
// ========================================
function abrirModalBitacora(turnoId, modo = 'editar') {
    const registro = registrosBitacora.find(r => Number(r.turno_id) === Number(turnoId));
    if (!registro) return;

    registroActivo = registro;

    document.getElementById('modalTurnoId').value = registro.turno_id;
    document.getElementById('modalModoAccion').value = modo;
    document.getElementById('modalEstadoActual').value = registro.estado_bitacora || 'PENDIENTE';

    document.getElementById('modalTurnoKicker').innerText = `Turno #${registro.turno_id}`;
    document.getElementById('modalTurnoTitulo').innerText =
        modo === 'finalizar'
            ? 'Finalizar registro de bitácora'
            : modo === 'ver'
                ? 'Detalle de bitácora'
                : 'Editar registro de bitácora';

    document.getElementById('modalCantidadReportada').innerText = registro.cantidad_reportada || registro.cantidad || '-';
    document.getElementById('modalResponsableRecibo').value = registro.responsable_recibo || '';
    document.getElementById('modalCantidadIngreso').value = registro.cantidad_ingreso ?? '';
    document.getElementById('modalCantidadSalida').value = registro.cantidad_salida ?? '';
    document.getElementById('modalConcepto').value = registro.concepto || '';
    document.getElementById('modalNoDev').value = registro.no_dev || '';
    document.getElementById('modalObservaciones').value =
        registro.observaciones_salida === 'Sin salida / sin novedad'
            ? ''
            : (registro.observaciones_salida || '');
    document.getElementById('modalEstadoVisible').innerText = registro.estado_bitacora || 'PENDIENTE';

    const esSoloLectura = modo === 'ver';

    [
        'modalResponsableRecibo',
        'modalCantidadIngreso',
        'modalCantidadSalida',
        'modalConcepto',
        'modalNoDev',
        'modalObservaciones'
    ].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = esSoloLectura;
    });

    document.getElementById('btnGuardarModalBitacora').style.display = esSoloLectura ? 'none' : 'inline-flex';
    document.getElementById('btnFinalizarModalBitacora').style.display = esSoloLectura ? 'none' : 'inline-flex';

    const infoMini = document.getElementById('modalInfoMini');
    infoMini.innerHTML = `
        <div class="info-chip">Operador: ${registro.nombre_operador || '-'}</div>
        <div class="info-chip">Placas: ${registro.placas || '-'}</div>
        <div class="info-chip">Proveedor: ${registro.proveedor || '-'}</div>
        <div class="info-chip">Folio: ${registro.folio || '-'}</div>
        <div class="info-chip">Llegó: ${formatearSoloHora(registro.hora_llegada)}</div>
        <div class="info-chip">Entró: ${formatearSoloHora(registro.hora_inicio_descarga)}</div>
        <div class="info-chip">Salió: ${formatearSoloHora(registro.hora_fin_descarga)}</div>
        <div class="info-chip">${obtenerBadgeBitacora(registro.estado_bitacora || 'PENDIENTE')}</div>
    `;

    actualizarVisibilidadModal();
    document.getElementById('modalBitacora').classList.add('activo');
}

function cerrarModalBitacora() {
    document.getElementById('modalBitacora').classList.remove('activo');
    registroActivo = null;
}

function actualizarVisibilidadModal() {
    const cantidadSalida = obtenerValorNumerico('modalCantidadSalida');
    const concepto = document.getElementById('modalConcepto').value;

    const campoConceptoWrapper = document.getElementById('campoConceptoWrapper');
    const campoNoDevWrapper = document.getElementById('campoNoDevWrapper');
    const campoObservacionesWrapper = document.getElementById('campoObservacionesWrapper');

    const inputNoDev = document.getElementById('modalNoDev');
    const textareaObservaciones = document.getElementById('modalObservaciones');
    const labelNoDev = document.getElementById('modalNoDevLabel');
    const selectConcepto = document.getElementById('modalConcepto');

    // Caso: no hay salida -> esconder TODO lo dependiente
    if (cantidadSalida === 0) {
        campoConceptoWrapper.style.display = 'none';
        campoNoDevWrapper.style.display = 'none';
        campoObservacionesWrapper.style.display = 'none';

        selectConcepto.value = '';
        inputNoDev.value = '';
        textareaObservaciones.value = '';
        return;
    }

    // Si sí hay salida, mostrar concepto
    campoConceptoWrapper.style.display = 'flex';

    // Si no hay concepto aún
    if (!concepto) {
        campoNoDevWrapper.style.display = 'none';
        campoObservacionesWrapper.style.display = 'none';
        inputNoDev.value = '';
        return;
    }

    // 1) Salida para otro cliente
    if (concepto === 'SALIDA_OTRO_CLIENTE') {
        campoNoDevWrapper.style.display = 'none';
        campoObservacionesWrapper.style.display = 'none';
        inputNoDev.value = '';
        textareaObservaciones.value = '';
        return;
    }

    // 2) Devolución Compra
    if (concepto === 'DEVOLUCION_COMPRA') {
        campoNoDevWrapper.style.display = 'flex';
        campoObservacionesWrapper.style.display = 'none';
        labelNoDev.innerText = 'No Dev / Folio';
        inputNoDev.placeholder = 'Ingresa folio';
        textareaObservaciones.value = '';
        return;
    }

    // 3) Otra
    if (concepto === 'OTRA') {
        campoNoDevWrapper.style.display = 'none';
        campoObservacionesWrapper.style.display = 'flex';
        inputNoDev.value = '';
        return;
    }
}

// ========================================
// VALIDACIONES
// ========================================
function validarBitacoraAntesDeGuardar(finalizar = false) {
    const responsable = document.getElementById('modalResponsableRecibo').value.trim();
    const cantidadIngreso = document.getElementById('modalCantidadIngreso').value.trim();
    const cantidadSalida = obtenerValorNumerico('modalCantidadSalida');
    const concepto = document.getElementById('modalConcepto').value;
    const noDev = document.getElementById('modalNoDev').value.trim();
    const observaciones = document.getElementById('modalObservaciones').value.trim();

    // Al guardar cambios NO bloqueamos tanto; al finalizar sí.
    if (!finalizar) {
        return { ok: true };
    }

    if (!responsable) {
        return { ok: false, mensaje: 'Debes seleccionar el responsable del recibo antes de finalizar.' };
    }

    if (!cantidadIngreso) {
        return { ok: false, mensaje: 'Debes capturar la cantidad de ingreso antes de finalizar.' };
    }

    if (cantidadSalida > 0 && !concepto) {
        return { ok: false, mensaje: 'Si existe cantidad de salida, debes seleccionar un concepto.' };
    }

    if (cantidadSalida > 0 && concepto === 'DEVOLUCION_COMPRA' && !noDev) {
        return { ok: false, mensaje: 'Debes capturar el No Dev / Folio para una Devolución Compra.' };
    }

    if (cantidadSalida > 0 && concepto === 'OTRA' && !observaciones) {
        return { ok: false, mensaje: 'Debes escribir observaciones cuando el concepto es "Otra".' };
    }

    return { ok: true };
}

// ========================================
// GUARDAR
// ========================================
async function guardarModalBitacora(finalizar = false) {
    const validacion = validarBitacoraAntesDeGuardar(finalizar);
    if (!validacion.ok) {
    AzToast.warning(validacion.mensaje, {
    title: 'Faltan datos'
    });
    return;
    }

    const turnoId = document.getElementById('modalTurnoId').value;

    let estadoBitacora = document.getElementById('modalEstadoActual').value || 'PENDIENTE';
    if (finalizar) {
        estadoBitacora = 'FINALIZADA';
    }

    const payload = {
        turno_id: Number(turnoId),
        responsable_recibo: document.getElementById('modalResponsableRecibo').value.trim(),
        cantidad_ingreso: document.getElementById('modalCantidadIngreso').value || null,
        cantidad_salida: document.getElementById('modalCantidadSalida').value || null,
        concepto: document.getElementById('modalConcepto').value,
        no_dev: document.getElementById('modalNoDev').value.trim(),
        estado_bitacora: estadoBitacora,
        observaciones_salida: document.getElementById('modalObservaciones').value.trim(),
        capturado_por: usuarioSesion?.nombre || ''
    };

    try {
        const res = await fetch('/api/bitacora/guardar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
        AzToast.error(data.error || 'No se pudo guardar el registro.', {
            title: 'Error al guardar'
        });
        return;
        }
        AzToast.success(
            finalizar
                ? 'Registro finalizado correctamente.'
                : 'Cambios guardados correctamente.',
            { title: 'Bitácora actualizada' }
        );
        cerrarModalBitacora();
        await cargarBitacora();
    } catch (error) {
        console.error("Error al guardar bitácora:", error);
        AzToast.error("Error de conexión al guardar el registro.", {
        title: 'Conexión'
    });
    }
}

// ========================================
// EVENTOS
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    const inputFecha = document.getElementById('filtroFechaBitacora');
    if (inputFecha) {
        inputFecha.value = hoyISO();
    }

    await cargarUsuarioSesion();

    document.getElementById('btnActualizarBitacora').addEventListener('click', cargarBitacora);

    document.getElementById('btnHoyBitacora').addEventListener('click', () => {
        document.getElementById('filtroFechaBitacora').value = hoyISO();
        cargarBitacora();
    });

    document.getElementById('btnImprimirBitacora').addEventListener('click', () => {
        window.print();
    });

    document.getElementById('busquedaBitacora').addEventListener('input', aplicarFiltrosYRender);
    document.getElementById('filtroEstadoBitacora').addEventListener('change', aplicarFiltrosYRender);
    document.getElementById('filtroFechaBitacora').addEventListener('change', cargarBitacora);

    document.getElementById('btnCerrarModalBitacora').addEventListener('click', cerrarModalBitacora);
    document.getElementById('modalCantidadSalida').addEventListener('input', actualizarVisibilidadModal);
    document.getElementById('modalConcepto').addEventListener('change', actualizarVisibilidadModal);

    document.getElementById('btnGuardarModalBitacora').addEventListener('click', () => {
        guardarModalBitacora(false);
    });

    document.getElementById('btnFinalizarModalBitacora').addEventListener('click', async () => {

    const ok = await AzConfirm({
        title: 'Finalizar registro',
        message: 'Esta acción marcará el registro como FINALIZADO.',
        confirmText: 'Finalizar',
        type: 'primary'
    });

    if (!ok) return;

    guardarModalBitacora(true);
});

    document.getElementById('modalBitacora').addEventListener('click', (e) => {
        if (e.target.id === 'modalBitacora') {
            cerrarModalBitacora();
        }
    });

    cargarBitacora();
});

// Actualización en tiempo real
socket.on('actualizacion_turnos', () => {
    cargarBitacora();
});