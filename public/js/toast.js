(function () {
    function getContainer() {
        let container = document.querySelector('.toast-container');

        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        return container;
    }

    function iconForType(type) {
        switch (type) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'info':
            default: return 'ℹ️';
        }
    }

    function titleForType(type) {
        switch (type) {
            case 'success': return 'Éxito';
            case 'error': return 'Error';
            case 'warning': return 'Atención';
            case 'info':
            default: return 'Información';
        }
    }

    function removeToast(toast) {
        if (!toast) return;
        toast.classList.add('closing');
        setTimeout(() => {
            toast.remove();
        }, 200);
    }

    function show(type, message, options = {}) {
        const {
            title = titleForType(type),
            duration = 3200
        } = options;

        const container = getContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        toast.innerHTML = `
            <div class="toast-icon">${iconForType(type)}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="Cerrar">✕</button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => removeToast(toast));

        container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => removeToast(toast), duration);
        }

        return toast;
    }

    window.AzToast = {
        success(message, options = {}) {
            return show('success', message, options);
        },
        error(message, options = {}) {
            return show('error', message, options);
        },
        warning(message, options = {}) {
            return show('warning', message, options);
        },
        info(message, options = {}) {
            return show('info', message, options);
        },
        custom(type, message, options = {}) {
            return show(type, message, options);
        }
    };
})();

window.AzConfirm = function ({
    title = 'Confirmar',
    message = '¿Estás seguro?',
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'danger' // danger | primary
} = {}) {

    return new Promise((resolve) => {

        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';

        const modal = document.createElement('div');
        modal.className = 'confirm-modal';

        modal.innerHTML = `
            <div class="confirm-title">${title}</div>
            <div class="confirm-message">${message}</div>
            <div class="confirm-actions">
                <button class="confirm-btn btn-cancel">${cancelText}</button>
                <button class="confirm-btn btn-confirm ${type === 'primary' ? 'primary' : ''}">
                    ${confirmText}
                </button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const btnCancel = modal.querySelector('.btn-cancel');
        const btnConfirm = modal.querySelector('.btn-confirm');

        function cerrar(valor) {
            overlay.remove();
            resolve(valor);
        }

        btnCancel.onclick = () => cerrar(false);
        btnConfirm.onclick = () => cerrar(true);

        overlay.onclick = (e) => {
            if (e.target === overlay) cerrar(false);
        };
    });
};


window.AzPrompt = function ({
    title = 'Entrada requerida',
    message = '',
    placeholder = '',
    confirmText = 'Aceptar',
    cancelText = 'Cancelar',
    defaultValue = ''
} = {}) {

    return new Promise((resolve) => {

        const overlay = document.createElement('div');
        overlay.className = 'prompt-overlay';

        const modal = document.createElement('div');
        modal.className = 'prompt-modal';

        modal.innerHTML = `
            <div class="prompt-title">${title}</div>
            <div class="prompt-message">${message}</div>

            <input class="prompt-input" placeholder="${placeholder}" value="${defaultValue}" />

            <div class="prompt-actions">
                <button class="prompt-btn prompt-cancel">${cancelText}</button>
                <button class="prompt-btn prompt-confirm">${confirmText}</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const input = modal.querySelector('.prompt-input');
        const btnCancel = modal.querySelector('.prompt-cancel');
        const btnConfirm = modal.querySelector('.prompt-confirm');

        input.focus();

        function cerrar(valor) {
            overlay.remove();
            resolve(valor);
        }

        btnCancel.onclick = () => cerrar(null);

        btnConfirm.onclick = () => {
            const valor = input.value.trim();
            cerrar(valor || null);
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                btnConfirm.click();
            }
        });

        overlay.onclick = (e) => {
            if (e.target === overlay) cerrar(null);
        };
    });
};

window.AzSelectAnden = function (turnos = []) {
    return new Promise((resolve) => {

        // 🔥 calcular ocupación de andenes
        const ocupacion = {
            1: 0,
            2: 0,
            3: 0,
            4: 0
        };

        turnos.forEach(t => {
            const anden = Number(t.anden);

            if (!anden || ![1,2,3,4].includes(anden)) return;

            if (t.estatus === 'En Descarga' || t.estatus === 'Proximo a Anden') {

                // lógica: grande = 2 espacios, chica = 1
                const slots = t.tamano_unidad === 'GRANDE' ? 2 : 1;
                ocupacion[anden] += slots;
            }
        });

        const overlay = document.createElement('div');
        overlay.className = 'prompt-overlay';

        const modal = document.createElement('div');
        modal.className = 'prompt-modal';

        modal.innerHTML = `
            <div class="prompt-title">Seleccionar andén</div>
            <div class="prompt-message">Selecciona un andén disponible</div>

            <div class="anden-grid">
                        ${[1,2,3,4].map(n => {

            const ocupando = turnos.filter(t => 
                Number(t.anden) === n &&
                (t.estatus === 'En Descarga' || t.estatus === 'Proximo a Anden')
            );

            let disponible = true;

            if ([1,2].includes(n)) {
                const slots = ocupando.reduce((sum, t) => {
                    return sum + (t.tamano_unidad === 'GRANDE' ? 2 : 1);
                }, 0);

                if (slots >= 2) disponible = false;
            }

            if ([3,4].includes(n)) {
                if (ocupando.length >= 1) disponible = false;
            }

            // 🔥 Construir info visual
            let detalleHTML = '';

            if (ocupando.length === 0) {
                detalleHTML = `<div class="anden-sub ok">Disponible</div>`;
            } else {
                detalleHTML = ocupando.map(t => {
                    return `
                        <div class="anden-ocupante">
                            <div><b>Área:</b> ${t.categoria || '-'}</div>
                            <div><b>Prov:</b> ${t.proveedor || '-'}</div>
                            <div><b>Placas:</b> ${t.placas || '-'}</div>
                        </div>
                    `;
                }).join('');
            }

            return `
                <button 
                    class="anden-btn ${!disponible ? 'disabled' : ''}" 
                    data-anden="${n}"
                    ${!disponible ? 'disabled' : ''}
                >
                    <div class="anden-num">Andén ${n}</div>
                    ${detalleHTML}
                </button>
            `;
        }).join('')}
            </div>

            <div class="prompt-actions">
                <button class="prompt-btn prompt-cancel">Cancelar</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function cerrar(valor) {
            overlay.remove();
            resolve(valor);
        }

        modal.querySelector('.prompt-cancel').onclick = () => cerrar(null);

        modal.querySelectorAll('.anden-btn').forEach(btn => {
            if (btn.disabled) return;

            btn.onclick = () => {
                cerrar(btn.dataset.anden);
            };
        });

        overlay.onclick = (e) => {
            if (e.target === overlay) cerrar(null);
        };
    });
};

window.AzSelectUnidad = function (unidades = []) {
    return new Promise((resolve) => {

        const overlay = document.createElement('div');
        overlay.className = 'prompt-overlay';

        const modal = document.createElement('div');
        modal.className = 'prompt-modal';

        modal.style.maxHeight = '80vh';
        modal.style.overflow = 'auto';

        modal.innerHTML = `
            <div class="prompt-title">Seleccionar unidad</div>
            <div class="prompt-message">Elige una unidad disponible</div>

            <div class="lista-unidades">
                ${unidades.map(t => `
                    <div class="unidad-item" data-id="${t.id}">
                        <strong>${t.nombre_operador || 'Sin nombre'}</strong>
                        <div>${t.proveedor || ''}</div>
                        <small>ID: ${t.id} | ${t.placas || ''}</small>
                    </div>
                `).join('')}
            </div>

            <div class="prompt-actions">
                <button class="prompt-btn prompt-cancel">Cancelar</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function cerrar(valor) {
            overlay.remove();
            resolve(valor);
        }

        modal.querySelector('.prompt-cancel').onclick = () => cerrar(null);

        modal.querySelectorAll('.unidad-item').forEach(item => {
            item.onclick = () => {
                cerrar(item.dataset.id);
            };
        });

        overlay.onclick = (e) => {
            if (e.target === overlay) cerrar(null);
        };
    });
};