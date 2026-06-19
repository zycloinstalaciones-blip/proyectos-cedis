/* ===============================================================
ADMIN V4.8 FRONTEND-ONLY CORREGIDO
- No depende de window.listaTurnosLocal
- Usa /api/turnos/{turnoId}/pre-documentos
- Rehidrata tarjetas ya renderizadas en #tab-patio
- Cambia "Ver" por "PRE" en En Descarga
=============================================================== */

(function adminV48FrontendOnlyPatch() {
  const cachePreDocsPorTurno = new Map();
  let debounceHydrate = null;

  function escaparSeguro(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function obtenerPreDocumentosTurno(turnoId) {
    if (!turnoId) return [];
    if (cachePreDocsPorTurno.has(turnoId)) {
      return cachePreDocsPorTurno.get(turnoId);
    }

    try {
      const res = await fetch(`/api/turnos/${encodeURIComponent(turnoId)}/pre-documentos`);
      const data = await res.json();

      if (!res.ok) {
        console.warn('No fue posible consultar documentos PRE del turno', turnoId, data);
        cachePreDocsPorTurno.set(turnoId, []);
        return [];
      }

      const docs = Array.isArray(data) ? data : [];
      cachePreDocsPorTurno.set(turnoId, docs);
      return docs;
    } catch (error) {
      console.error('Error consultando PRE por turno:', turnoId, error);
      cachePreDocsPorTurno.set(turnoId, []);
      return [];
    }
  }

  function extraerFoliosDesdePreDocs(docs) {
    if (!Array.isArray(docs)) return [];

    return docs
      .map(doc =>
        doc?.pre_entrada_compra ||
        doc?.folio ||
        doc?.factura ||
        doc?.referencia ||
        ''
      )
      .map(v => String(v || '').trim())
      .filter(Boolean);
  }

  function construirHtmlFolios(folios, totalDocs = 0) {
    const total = folios.length;

    if (total === 1) {
      return {
        label: 'Entrada:',
        html: `<span>${escaparSeguro(folios[0])}</span>`
      };
    }

    if (total > 1) {
      const tooltip = escaparSeguro(folios.join('\n'));
      return {
        label: 'Entradas:',
        html: `
          <div class="tooltip-folios" data-folios="${tooltip}">
            (${total}) <span class="icono-ayuda">?</span>
          </div>
        `
      };
    }

    if (Number(totalDocs) > 1) {
      return {
        label: 'Folio:',
        html: `
          <div class="tooltip-folios" data-folios="Hay ${Number(totalDocs)} entradas asignadas a esta unidad.">
            (${Number(totalDocs)}) <span class="icono-ayuda">?</span>
          </div>
        `
      };
    }

    if (Number(totalDocs) === 1) {
      return {
        label: 'Folio:',
        html: `<span>(1)</span>`
      };
    }

    return {
      label: 'Folio:',
      html: '<span>-</span>'
    };
  }

  function encontrarLineaFolio(card) {
    const lineas = [...card.querySelectorAll('.linea-dato')];
    return lineas.find(linea => {
      const bold = linea.querySelector('b');
      if (!bold) return false;
      return String(bold.textContent || '').trim().toLowerCase().startsWith('folio');
    });
  }

  function pintarLineaFolio(card, foliosUI) {
    const linea = encontrarLineaFolio(card);
    if (!linea) return;

    linea.innerHTML = `
      <span class="dato-icono">📄</span>
      <b>${escaparSeguro(foliosUI.label)}</b>
      ${foliosUI.html}
    `;
  }

  function reemplazarBotonVerPorPre(card, turnoId) {
    const botonesInfo = [...card.querySelectorAll('.btn-action-info')];
    if (!botonesInfo.length) return;

    botonesInfo.forEach(btn => {
      const texto = String(btn.textContent || '').toLowerCase();
      const onclickAttr = btn.getAttribute('onclick') || '';

      const esBotonVer =
        texto.includes('ver') ||
        onclickAttr.includes('/entradas.html');

      if (esBotonVer) {
        btn.innerHTML = '📄 PRE';
        btn.setAttribute('onclick', `abrirModalPreTurno(${Number(turnoId)})`);
      }
    });
  }

  async function hidratarTarjetaPatio(card) {
    const turnoId = Number(card.dataset.id);
    if (!turnoId) return;

    // Siempre corrige Ver -> PRE
    reemplazarBotonVerPorPre(card, turnoId);

    // Trae los documentos ligados del turno
    const docs = await obtenerPreDocumentosTurno(turnoId);
    const folios = extraerFoliosDesdePreDocs(docs);
    const foliosUI = construirHtmlFolios(folios, docs.length);

    pintarLineaFolio(card, foliosUI);
  }

  async function hidratarTarjetasPatio() {
    const cards = [...document.querySelectorAll('#tab-patio .card-entrega[data-id]')];
    if (!cards.length) return;

    for (const card of cards) {
      await hidratarTarjetaPatio(card);
    }
  }

  function refrescarFoliosPatioAutomaticamente() {
  setInterval(() => {
    hidratarTarjetasPatio();
  }, 4000);
}

  function programarHidratacion() {
    clearTimeout(debounceHydrate);
    debounceHydrate = setTimeout(() => {
      hidratarTarjetasPatio();
    }, 120);
  }

  // 1) Hidrata una vez al cargar
  setTimeout(programarHidratacion, 300);

  // 2) Observa cuando el patio se vuelve a renderizar
  const tabPatio = document.getElementById('tab-patio');
  if (tabPatio) {
    const observer = new MutationObserver(() => {
      programarHidratacion();
    });

    observer.observe(tabPatio, {
      childList: true
    });
  }

  // 3) También rehace al cambiar de pestaña
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setTimeout(programarHidratacion, 180);
    });
  });

  console.info('Admin V4.8 frontend-only corregido cargado');
  
  refrescarFoliosPatioAutomaticamente();

})();
