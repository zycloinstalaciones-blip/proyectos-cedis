const socket = io();
let turnoActualId = null;

function parseQuery() {
    const params = new URLSearchParams(window.location.search);
    return {
        id: params.get('id'),
        folio: params.get('folio'),
        placas: params.get('placas')
    };
}

function formatearFechaHora(valor) {
    if (!valor) return '-';
    return String(valor);
}

function normalizarEstado(estatus) {
    const e = String(estatus || '').toLowerCase();
    if (e.includes('finalizado')) return 'FINALIZADO';
    if (e.includes('descarga')) return 'DESCARGA';
    if (e.includes('proximo')) return 'PROXIMO';
    if (e.includes('espera')) return 'ESPERA';
    if (e.includes('programado')) return 'PROGRAMADO';
    return 'ESPERA';
}

function clasePillPorEstado(estatus) {
    const e = normalizarEstado(estatus);
    if (e === 'FINALIZADO') return 'estado-finalizado';
    if (e === 'DESCARGA') return 'estado-descarga';
    if (e === 'PROXIMO') return 'estado-proximo';
    if (e === 'PROGRAMADO') return 'estado-programado';
    return 'estado-espera';
}

function textoPill(estatus) {
    switch (normalizarEstado(estatus)) {
        case 'FINALIZADO': return 'Finalizado';
        case 'DESCARGA': return 'En descarga';
        case 'PROXIMO': return 'Próximo a andén';
        case 'PROGRAMADO': return 'Programado';
        case 'ESPERA':
        default: return 'En espera';
    }
}

function mensajePorEstado(estatus, anden) {
    switch (normalizarEstado(estatus)) {
        case 'FINALIZADO':
            return 'Tu unidad ya concluyó el proceso dentro de operación.';
        case 'DESCARGA':
            return `Tu unidad ya se encuentra en proceso de descarga${anden ? ` en andén ${anden}` : ''}.`;
        case 'PROXIMO':
            return `Tu unidad está próxima a pasar a andén${anden ? ` ${anden}` : ''}.`;
        case 'PROGRAMADO':
            return 'Tu cita fue registrada. Aún no aparece como ingreso físico a patio.';
        case 'ESPERA':
        default:
            return 'Tu unidad ya está registrada y espera asignación de andén.';
    }
}

function actualizarTimeline(estatus) {
    const actual = normalizarEstado(estatus);
    const orden = ['PROGRAMADO', 'ESPERA', 'PROXIMO', 'DESCARGA', 'FINALIZADO'];
    const indice = orden.indexOf(actual);

    document.querySelectorAll('.timeline-step').forEach((step) => {
        step.classList.remove('active', 'done');
        const paso = step.dataset.step;
        const idxPaso = orden.indexOf(paso);

        if (idxPaso < indice) {
            step.classList.add('done');
        } else if (idxPaso === indice) {
            step.classList.add('active');
        }
    });
}

function pintarTurno(turno) {
    if (!turno) return;

    turnoActualId = turno.id;

    document.getElementById('turnoVacio').classList.add('hidden');
    document.getElementById('turnoDetalle').classList.remove('hidden');
    document.getElementById('estadoGeneralCard').classList.remove('hidden');

    const pill = document.getElementById('estadoPill');
    pill.className = `estado-pill ${clasePillPorEstado(turno.estatus)}`;
    pill.textContent = textoPill(turno.estatus);

    document.getElementById('estadoMensaje').textContent = mensajePorEstado(turno.estatus, turno.anden);
    document.getElementById('andenValue').textContent = turno.anden || 'Sin asignar';

    document.getElementById('datoFolio').textContent = turno.folio || '-';
    document.getElementById('datoPlacas').textContent = turno.placas || '-';
    document.getElementById('datoOperador').textContent = turno.nombre_operador || '-';
    document.getElementById('datoProveedor').textContent = turno.proveedor || '-';
    document.getElementById('datoUnidad').textContent = turno.tipo_unidad || '-';
    document.getElementById('datoCategoria').textContent = turno.categoria || '-';
    document.getElementById('datoCantidad').textContent = turno.cantidad || '-';

    document.getElementById('datoCita').textContent = formatearFechaHora(turno.hora_cita);
    document.getElementById('datoLlegada').textContent = formatearFechaHora(turno.hora_llegada);
    document.getElementById('datoInicio').textContent = formatearFechaHora(turno.hora_inicio_descarga);
    document.getElementById('datoFin').textContent = formatearFechaHora(turno.hora_fin_descarga);

    actualizarTimeline(turno.estatus);
}

async function buscarTurno() {
    const folio = document.getElementById('folioInput').value.trim();

    if (!folio) {
        AzToast.warning('Escribe un folio, placas o entra desde el registro para localizar tu turno.', {
            title: 'Falta información'
        });
        return;
    }

    try {
        const res = await fetch('/api/mi-turno/buscar?q=' + encodeURIComponent(folio));
        const data = await res.json();

        if (!res.ok) {
            AzToast.error(data.error || 'No se encontró un turno con ese dato.', {
                title: 'Turno no encontrado'
            });
            return;
        }

        pintarTurno(data);
    } catch (error) {
        console.error('Error al buscar turno:', error);
        AzToast.error('No fue posible consultar el turno en este momento.', {
            title: 'Error de conexión'
        });
    }
}

async function cargarDesdeQuery() {
    const { id, folio, placas } = parseQuery();

    try {
        let url = null;

        if (id) {
            url = '/api/mi-turno/' + encodeURIComponent(id);
        } else if (folio) {
            url = '/api/mi-turno/buscar?q=' + encodeURIComponent(folio);
        } else if (placas) {
            url = '/api/mi-turno/buscar?q=' + encodeURIComponent(placas);
        }

        if (!url) return;

        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) return;

        if (folio) document.getElementById('folioInput').value = folio;
        if (placas && !folio) document.getElementById('folioInput').value = placas;

        pintarTurno(data);
    } catch (error) {
        console.error('Error al cargar turno desde query:', error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await cargarDesdeQuery();

    document.getElementById('btnBuscarTurno').addEventListener('click', buscarTurno);
    document.getElementById('folioInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') buscarTurno();
    });
});

socket.on('actualizacion_turnos', async () => {
    if (!turnoActualId) return;

    try {
        const res = await fetch('/api/mi-turno/' + encodeURIComponent(turnoActualId));
        const data = await res.json();
        if (!res.ok) return;
        pintarTurno(data);
    } catch (error) {
        console.error('Error al refrescar turno en tiempo real:', error);
    }
});
