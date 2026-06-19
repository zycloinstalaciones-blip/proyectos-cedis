(function () {
    const STATUS_VISUALS = {
        'En Espera': {
            key: 'En Espera',
            classEstado: 'estado-pendiente',
            badgeClass: 'badge-pendiente',
            getBadgeText: () => 'EN ESPERA',
            recepcion: {
                filaEstilo: 'background-color: #fffdf5;',
                badgeHTML: `<span style="background: #fef9c3; color: #854d0e; padding: 5px 10px; border-radius: 20px; font-weight: 600; font-size: 0.8rem;">⏳ En Patio (Espera)</span>`
            }
        },

        'Proximo a Anden': {
            key: 'Proximo a Anden',
            classEstado: 'estado-proximo',
            badgeClass: 'badge-proximo',
            getBadgeText: (turno) => `DIRIGIRSE A ANDÉN ${turno?.anden || '-'}`,
            recepcion: {
                filaEstilo: 'background-color: #f0fdf4; font-weight: 500;',
                badgeHTML: (turno) => `<span style="background: #bbf7d0; color: #166534; padding: 5px 10px; border-radius: 20px; font-weight: 600; font-size: 0.8rem;">🚛 Andén ${turno?.anden || 'Asignando'}</span>`
            }
        },

        'En Descarga': {
            key: 'En Descarga',
            classEstado: 'estado-confirmada',
            badgeClass: 'badge-confirmada',
            getBadgeText: (turno) => `EN ANDÉN ${turno?.anden || '-'}`,
            recepcion: {
                filaEstilo: 'background-color: #f0fdf4; font-weight: 500;',
                badgeHTML: (turno) => `<span style="background: #bbf7d0; color: #166534; padding: 5px 10px; border-radius: 20px; font-weight: 600; font-size: 0.8rem;">🚛 Andén ${turno?.anden || 'Asignando'}</span>`
            }
        },

        'Finalizado': {
            key: 'Finalizado',
            classEstado: 'estado-finalizado',
            badgeClass: 'badge-finalizado',
            getBadgeText: () => 'FINALIZADO',
            recepcion: {
                filaEstilo: 'background-color: #f3f4f6; opacity: 0.65;',
                badgeHTML: `<span style="background: #e5e7eb; color: #4b5563; padding: 5px 10px; border-radius: 20px; font-weight: 600; font-size: 0.8rem; border: 1px solid #d1d5db;">🚫 Finalizado / No Disponible</span>`
            }
        },

        'Programado': {
            key: 'Programado',
            classEstado: 'estado-programado',
            badgeClass: 'badge-programado',
            getBadgeText: () => 'PROGRAMADO',
            recepcion: {
                filaEstilo: 'background-color: #ffffff;',
                badgeHTML: `<span style="background: #e0e7ff; color: #3730a3; padding: 5px 10px; border-radius: 20px; font-weight: 600; font-size: 0.8rem; border: 1px solid #c7d2fe;">🗓️ Cita Programada</span>`
            }
        }
    };

    function getStatusVisual(estatus, turno = {}) {
        const visual = STATUS_VISUALS[estatus] || STATUS_VISUALS['En Espera'];

        return {
            key: visual.key,
            classEstado: visual.classEstado,
            badgeClass: visual.badgeClass,
            badgeText: typeof visual.getBadgeText === 'function'
                ? visual.getBadgeText(turno)
                : visual.getBadgeText
        };
    }

    function getRecepcionStatusVisual(turno = {}) {
        const visual = STATUS_VISUALS[turno.estatus] || STATUS_VISUALS['En Espera'];
        const recepcion = visual.recepcion || STATUS_VISUALS['En Espera'].recepcion;

        return {
            filaEstilo: recepcion.filaEstilo || '',
            badgeHTML: typeof recepcion.badgeHTML === 'function'
                ? recepcion.badgeHTML(turno)
                : recepcion.badgeHTML
        };
    }

    window.AzStatus = {
        STATUS_VISUALS,
        getStatusVisual,
        getRecepcionStatusVisual
    };
})();