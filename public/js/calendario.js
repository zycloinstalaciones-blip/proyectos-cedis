document.addEventListener('DOMContentLoaded', function() {
    const calendarEl = document.getElementById('calendar');

    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek', // Vista semanal por horas
        locale: 'es',
        slotMinTime: '06:00:00', // Empieza a las 6 AM
        slotMaxTime: '22:00:00', // Termina a las 10 PM
        allDaySlot: false,
        expandRows: true,
        nowIndicator: true,
        
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },

        // Cargar eventos desde nuestra API de SQLite
        events: async function(info, successCallback, failureCallback) {
            try {
                const res = await fetch('/api/calendario');
                const turnos = await res.json();

                const eventos = turnos.map(t => {
                    // Si tiene cita usa esa fecha, sino usa la hora de llegada física
                    const fechaInicioStr = t.hora_cita ? t.hora_cita.replace(' ', 'T') : t.hora_llegada.replace(' ', 'T');
                    const startDate = new Date(fechaInicioStr);
                    
                    // Calculamos 1 hora y media de bloque visual
                    const endDate = new Date(startDate.getTime() + 90 * 60000); 

                    // Definir color de fondo basado en el estatus
                    let colorBase = '#005baa'; // Azul por defecto
                    let colorBorde = '#ff9800'; // Naranja (En Espera)
                    
                    if(t.estatus === 'En Descarga') colorBorde = '#28a745'; // Verde
                    if(t.estatus === 'Finalizado') {
                        colorBase = '#e2e3e5'; // Gris claro
                        colorBorde = '#6c757d'; // Gris oscuro
                    }

                    return {
                        id: t.id,
                        title: t.proveedor,
                        start: startDate,
                        end: endDate,
                        backgroundColor: colorBase,
                        borderColor: colorBase,
                        extendedProps: {
                            ...t,
                            colorBorde: colorBorde
                        }
                    };
                });

                successCallback(eventos);
            } catch (error) {
                console.error("Error al cargar calendario:", error);
                failureCallback(error);
            }
        },

        // Personalizar el cuadrito visual de la cita
        eventContent: function(arg) {
            const t = arg.event.extendedProps;
            const esFinalizado = t.estatus === 'Finalizado';
            const colorTexto = esFinalizado ? '#333' : '#fff';

            return {
                html: `
                <div style="padding:4px; height:100%; border-left: 4px solid ${t.colorBorde}; color:${colorTexto}; overflow:hidden;">
                    <strong style="font-size:0.9rem; line-height:1.2; display:block;">${t.proveedor}</strong>
                    <span style="font-size:0.75rem; line-height:1.1; display:block; margin-top:2px;">${t.tipo_unidad}</span>
                    <span style="font-size:0.7rem; opacity:0.8;">Folio: ${t.folio || 'N/A'}</span>
                </div>`
            };
        },

        // Acción al hacer clic en un evento (Abre el Ticket)
        eventClick: function(info) {
            const t = info.event.extendedProps;
            
            document.getElementById('md-folio').textContent = `FOLIO: ${t.folio || 'SIN FOLIO'}`;
            document.getElementById('md-titulo').textContent = `${t.proveedor} - ${t.tipo_unidad}`;
            document.getElementById('md-fecha').textContent = t.hora_cita || t.hora_llegada;
            document.getElementById('md-operador').textContent = t.nombre_operador || 'Pendiente';
            document.getElementById('md-telefono').textContent = t.telefono || '-';
            document.getElementById('md-placas').textContent = t.placas || '-';
            document.getElementById('md-carga').textContent = `${t.carga} ${t.cantidad ? '('+t.cantidad+')' : ''}`;
            
            // Pinta la etiqueta de estatus en el ticket
            const estatusEl = document.getElementById('md-estado');
            estatusEl.textContent = t.estatus;
            if(t.estatus === 'En Espera') { estatusEl.style.background = '#fff3cd'; estatusEl.style.color = '#856404'; }
            else if(t.estatus === 'En Descarga') { estatusEl.style.background = '#d4edda'; estatusEl.style.color = '#155724'; }
            else { estatusEl.style.background = '#e2e3e5'; estatusEl.style.color = '#383d41'; }

            document.getElementById('modalDetalle').style.display = 'flex';
        }
    });

    calendar.render();
});