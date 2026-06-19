/* ===============================================================
PATCH V3 - MOBILE CARD ENHANCER
Cargar DESPUÉS de admin_unificado.js
- Reduce densidad visual en móvil
- Reordena prioridades en tarjetas
- Oculta datos secundarios en móvil
- Reduce botones visibles según prioridad
=============================================================== */
(function adminMobileEnhancer() {
  const MOBILE_BP = 899;

  function isMobileLike() {
    return window.innerWidth <= MOBILE_BP;
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function getLabelPriority(label) {
    const key = normalizeText(label).replace(/:$/, '');
    if (key === 'area') return 1;
    if (key === 'folio' || key === 'entrada') return 2;
    if (key === 'unidad') return 2;
    if (key === 'cita / llegada' || key === 'cita/llegada' || key === 'arribo' || key === 'llegada') return 2;
    if (key === 'inicio') return 2;
    if (key === 'entrega') return 2;
    if (key === 'prov' || key === 'proveedor') return 3;
    if (key === 'tel' || key === 'telefono') return 4;
    return 3;
  }

  function getButtonPriority(button) {
    const txt = normalizeText(button.textContent);
    const classes = button.className || '';
    if (/llamar a anden|llamar|anden/.test(txt)) return 1;
    if (/iniciar validacion|cerrar validacion|escaner/.test(txt)) return 1;
    if (/ver rampa/.test(txt)) return 1;
    if (/sig/.test(txt)) return 2;
    if (/pre/.test(txt)) return 2;
    if (/finalizar|cerrar|quitar/.test(txt)) return 3;
    if (/btn-action-primary|btn-action-success|btn-action-info/.test(classes)) return 1;
    if (/btn-action-warning/.test(classes)) return 2;
    if (/btn-action-danger|btn-action-neutral/.test(classes)) return 3;
    return 2;
  }

  function decorateCard(card) {
    if (!card) return;

    const title = card.querySelector('.titulo-operador');
    if (title) {
      title.dataset.short = title.textContent.trim();
    }

    const lines = [...card.querySelectorAll('.linea-dato')];
    lines.forEach((line) => {
      const labelEl = line.querySelector('b');
      const label = labelEl ? labelEl.textContent : '';
      const priority = getLabelPriority(label);
      const normalized = normalizeText(label).replace(/:$/, '');
      line.dataset.priority = String(priority);
      line.dataset.label = normalized;
      if (normalized === 'area') line.dataset.isArea = '1';
      if (normalized === 'folio' || normalized === 'entrada') line.dataset.isFolio = '1';
      if (normalized === 'arribo' || normalized === 'llegada' || normalized === 'cita / llegada' || normalized === 'cita/llegada') line.dataset.isArrival = '1';
    });

    const grid = card.querySelector('.acciones-grid');
    if (grid) {
      const buttons = [...grid.querySelectorAll('button')];
      const ordered = buttons
        .map((button, index) => ({ button, index, p: getButtonPriority(button) }))
        .sort((a, b) => a.p - b.p || a.index - b.index);

      ordered.forEach(({ button }) => grid.appendChild(button));

      const maxVisible = window.innerWidth <= 479 ? 2 : 3;
      let visibleCount = 0;
      ordered.forEach(({ button }, idx) => {
        const shouldHide = isMobileLike() && idx >= maxVisible;
        button.dataset.mobileHidden = shouldHide ? '1' : '0';
        if (!shouldHide) visibleCount += 1;
      });
      grid.dataset.visibleCount = String(Math.max(1, visibleCount));
    }

    const footer = card.querySelector('.card-admin-footer');
    if (footer && !footer.querySelector('.acciones-grid')) {
      const directButtons = [...footer.querySelectorAll(':scope > button')];
      if (directButtons.length > 1) {
        const ordered = directButtons
          .map((button, index) => ({ button, index, p: getButtonPriority(button) }))
          .sort((a, b) => a.p - b.p || a.index - b.index);
        ordered.forEach(({ button }) => footer.appendChild(button));
        const maxVisible = window.innerWidth <= 479 ? 2 : 3;
        ordered.forEach(({ button }, idx) => {
          button.dataset.mobileHidden = isMobileLike() && idx >= maxVisible ? '1' : '0';
          button.style.display = button.dataset.mobileHidden === '1' ? 'none' : '';
        });
      }
    }
  }

  function processCards(root = document) {
    const cards = root.querySelectorAll('.card-admin');
    cards.forEach(decorateCard);
    document.body.classList.toggle('admin-mobile-layout', isMobileLike());
  }

  function patchRenderFunction(name) {
    const fn = window[name];
    if (typeof fn !== 'function' || fn.__mobilePatched) return;
    const wrapped = function(...args) {
      const result = fn.apply(this, args);
      requestAnimationFrame(() => processCards(document));
      return result;
    };
    wrapped.__mobilePatched = true;
    window[name] = wrapped;
  }

  function installObservers() {
    const patio = document.getElementById('tab-patio');
    const historial = document.getElementById('tab-historial');
    const targets = [patio, historial].filter(Boolean);
    if (!targets.length) return;

    const observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length || mutation.removedNodes.length) {
          shouldProcess = true;
          break;
        }
      }
      if (shouldProcess) requestAnimationFrame(() => processCards(document));
    });

    targets.forEach((target) => observer.observe(target, { childList: true, subtree: true }));
  }

  let resizeRAF = null;
  window.addEventListener('resize', () => {
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => processCards(document));
  });

  patchRenderFunction('renderizarPatio');
  patchRenderFunction('renderizarHistorial');
  patchRenderFunction('aplicarFiltroHistorial');

  document.addEventListener('DOMContentLoaded', () => {
    processCards(document);
    installObservers();
  });

  if (document.readyState !== 'loading') {
    processCards(document);
    installObservers();
  }


  
})();
