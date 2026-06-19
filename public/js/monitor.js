const socket = io();

if (!window.AzUI) {
    console.error("AzUI no está disponible. Verifica que /js/shared-ui-config.js cargue antes que monitor.js");
}

if (!window.AzStatus) {
    console.error("AzStatus no está disponible. Verifica que /js/shared-status-config.js cargue antes que monitor.js");
}

// ========================================
// CALCULAR TIEMPO TRANSCURRIDO
// ========================================
function obtenerTiempoTranscurrido(fechaInicio) {
    if (!fechaInicio) return null;

    const ahora = new Date();
    const inicio = new Date(fechaInicio.replace(' ', 'T'));
    const diff = Math.floor((ahora - inicio) / 1000);

    const horas = Math.floor(diff / 3600);
    const minutos = Math.floor((diff % 3600) / 60);

    return {
        totalMin: Math.floor(diff / 60),
        texto: `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`
    };
}

function formatearTiempoAmigable(minutosTotales) {
    if (!minutosTotales || minutosTotales <= 0) return '0 min';

    const horas = Math.floor(minutosTotales / 60);
    const minutos = minutosTotales % 60;

    if (horas > 0) {
        return `${horas} hr ${minutos} min`;
    }

    return `${minutos} min`;
}


function determinarEstatusTiempo(horaCita) {
    if (!horaCita) return '';

    const ahora = new Date();
    const cita = new Date(horaCita.replace(' ', 'T'));

    return ahora > cita
        ? `<span class="card-status-badge badge-retraso">DEMORADO</span>`
        : `<span class="card-status-badge badge-tiempo">A TIEMPO</span>`;
}

function actualizarHeadersColumnas(conteos) {
    const headers = document.querySelectorAll('.columna-header');
    if (headers.length < 3) return;

    headers[0].innerHTML = `
        <span class="header-title-left">🚚 EN FILA</span>
        <span class="header-count-bubble">${conteos.enFila}</span>
    `;

    headers[1].innerHTML = `
        <span class="header-title-left">📢 SIGUIENTE A RAMPA</span>
        <span class="header-count-bubble">${conteos.proximos}</span>
    `;

    headers[2].innerHTML = `
        <span class="header-title-left">⚙️ OPERACIÓN ACTIVA</span>
        <span class="header-count-bubble">${conteos.enDescarga}</span>
    `;
}

// ========================================
// CARGAR MONITOR
// ========================================
async function cargarMonitor() {
    try {
        // Traer turnos activos
        const respuesta = await fetch('/api/turnos');
        const turnos = await respuesta.json();

        // Traer historial para calcular promedio real
        const resHistorial = await fetch('/api/historial');
        const historial = await resHistorial.json();

        const contCitados = document.getElementById('lista-citados');
        const contNoCitados = document.getElementById('lista-nocitados');
        const contPrepararse = document.getElementById('lista-prepararse');

        contCitados.innerHTML = '';
        contNoCitados.innerHTML = '';
        contPrepararse.innerHTML = '';

        // ========================================
        // KPI OPERATIVOS
        // ========================================

        // Solo en espera real
        const soloEnEspera = turnos.filter(t => t.estatus === 'En Espera').length;

        // Próximo a rampa
        const enProximo = turnos.filter(t => t.estatus === 'Proximo a Anden').length;

        // Operación activa
        const enDescarga = turnos.filter(t => t.estatus === 'En Descarga').length;

        // KPI superior: pendientes de descarga = espera + próximos
        const enEspera = soloEnEspera + enProximo;

        // Andenes ocupados
        const andenesOcupados = new Set(
            turnos
                .filter(t => t.estatus === 'En Descarga')
                .map(t => t.anden)
        ).size;

        // ========================================
        // PROMEDIO DESCARGA (tomado desde historial)
        // ========================================
        let promedio = 0;

        const finalizados = historial.filter(
            t => t.hora_inicio_descarga && t.hora_fin_descarga
        );

        if (finalizados.length > 0) {
            let totalMin = 0;

            finalizados.forEach(t => {
                const inicio = new Date(t.hora_inicio_descarga.replace(' ', 'T'));
                const fin = new Date(t.hora_fin_descarga.replace(' ', 'T'));
                totalMin += (fin - inicio) / 60000;
            });

            promedio = Math.round(totalMin / finalizados.length);
        }

        // ========================================
        // PINTAR KPIs
        // ========================================
        document.getElementById('kpiEspera').innerText = enEspera;
        document.getElementById('kpiDescarga').innerText = enDescarga;
        document.getElementById('kpiAndenes').innerText = `${andenesOcupados}/4`;
        document.getElementById('kpiPromedio').innerText = `${promedio}m`;

        // ========================================
        // ACTUALIZAR ENCABEZADOS DE COLUMNAS
        // ========================================
        actualizarHeadersColumnas({
            enFila: soloEnEspera,
            proximos: enProximo,
            enDescarga: enDescarga
        });

        // ========================================
        // ORDENAR TARJETAS
        // ========================================
        turnos
            .sort((a, b) => {
                // Urgentes primero
                if (a.prioridad === 'URGENTE' && b.prioridad !== 'URGENTE') return -1;
                if (b.prioridad === 'URGENTE' && a.prioridad !== 'URGENTE') return 1;

                // Descargas activas primero por tiempo
                const tiempoA = a.hora_inicio_descarga
                    ? obtenerTiempoTranscurrido(a.hora_inicio_descarga)?.totalMin || 0
                    : 0;

                const tiempoB = b.hora_inicio_descarga
                    ? obtenerTiempoTranscurrido(b.hora_inicio_descarga)?.totalMin || 0
                    : 0;

                return tiempoB - tiempoA;
            })
            .forEach(t => {
                const statusVisual = window.AzStatus.getStatusVisual(t.estatus, t);
                const claseEstado = statusVisual.classEstado;
                const claseBadge = statusVisual.badgeClass;
                const textoBadge = statusVisual.badgeText;

                const visualCategoria = window.AzUI.getCategoryVisual(t.categoria);
                const colorCategoria = visualCategoria.color;
                const iconoCategoria = visualCategoria.icono;
                const nombreCategoria = visualCategoria.nombreTarjeta || visualCategoria.nombre;

                let iconoUnidad = '🚛';
                if (t.tipo_unidad && t.tipo_unidad.toLowerCase().includes('camioneta')) {
                    iconoUnidad = '🚚';
                }

                const esUrgente = t.prioridad === 'URGENTE';
                let leyendaUrgente = '';
                if (esUrgente) {
                    leyendaUrgente = `<span class="aviso-urgente-monitor">🚨 URGENTE</span>`;
                }

                let tiempoHTML = '';
                let tiempoAmigable = ''; // ✅ CLAVE

                if (t.estatus === 'En Descarga' && t.hora_inicio_descarga) {
                    const tiempo = obtenerTiempoTranscurrido(t.hora_inicio_descarga);

                    let claseTiempo = 'tiempo-normal';
                    if (tiempo.totalMin >= 40) claseTiempo = 'tiempo-alerta';
                    if (tiempo.totalMin >= 70) claseTiempo = 'tiempo-critico';

                    tiempoAmigable = formatearTiempoAmigable(tiempo.totalMin); // ✅ ahora sí asigna

                    tiempoHTML = `
                        <div class="timer-box ${claseTiempo}">
                            <div class="timer-label">Tiempo en andén</div>
                            <div class="timer-value">⏱ ${tiempoAmigable}</div>
                        </div>
                    `;
                }

                const tarjeta = document.createElement('div');
                tarjeta.className = `card-entrega ${claseEstado}`;
                tarjeta.style.setProperty('--color-card', colorCategoria);

                tarjeta.innerHTML = `
                    <div class="card-header">
                    <span class="card-status-badge ${claseBadge}">
                        ${textoBadge}
                    </span>
                    ${
                        t.estatus === 'En Descarga' && t.hora_inicio_descarga
                        ? `<span class="mini-timer">⏱ ${tiempoAmigable}</span>`
                        : ''
                    }
                </div>
                    <div class="card-body">
                        ${leyendaUrgente}
                        <div class="placas-main">
                            ${t.placas || 'SIN PLACAS'}
                        </div>
                        <div class="operador-main">
                            ${t.nombre_operador || 'Operador Pendiente'}
                        </div>
                        <div class="unidad-main">
                            ${iconoUnidad}
                            ${t.tipo_unidad || 'TIPO NO DEFINIDO'}
                        </div>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="info-icon">🏢</span>
                                <span>${t.proveedor || 'SIN PROVEEDOR'}</span>
                            </div>
                            <div class="info-item">
                                <span class="info-icon">${iconoCategoria}</span>
                                <span>${nombreCategoria}</span>
                            </div>
                        </div>
                        ${tiempoHTML}
                    </div>
                    `;
                if (t.estatus === 'Proximo a Anden') {
                    contPrepararse.appendChild(tarjeta);
                } else if (t.estatus === 'En Descarga') {
                    contNoCitados.appendChild(tarjeta);
                } else if (t.estatus === 'En Espera') {
                    contCitados.appendChild(tarjeta);
                }
            });

    } catch (error) {
        console.error("Error al cargar los turnos:", error);
    }
}

// ========================================
// RELOJ EN VIVO
// ========================================
function actualizarReloj() {
    const ahora = new Date();

    const fecha = ahora.toLocaleDateString('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });

    const hora = ahora.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    document.getElementById('fechaActual').innerText = fecha;
    document.getElementById('horaActual').innerText = hora;
}

// ========================================
// INICIALIZACIÓN Y ACTUALIZACIONES EN TIEMPO REAL
// ========================================
cargarMonitor();
socket.on('actualizacion_turnos', cargarMonitor);

setInterval(actualizarReloj, 1000);
actualizarReloj();

setInterval(() => {
    cargarMonitor();
}, 15000);