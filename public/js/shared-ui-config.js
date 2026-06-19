(function () {
    const CATEGORY_VISUALS = {
        PISO: {
            key: 'PISO',
            color: '#ea580c',
            icono: '🧱',
            nombre: 'PISO',
            nombreTarjeta: 'PISO'
        },
        BAÑO: {
            key: 'BAÑO',
            color: '#2563eb',
            icono: '🚽',
            nombre: 'BAÑO',
            nombreTarjeta: 'BAÑO'
        },
        GRIFERIA: {
            key: 'GRIFERIA',
            color: '#059669',
            icono: '🚰',
            nombre: 'GRIFERIA',
            nombreTarjeta: 'GRIFERÍA'
        },
        GENERAL: {
            key: 'GENERAL',
            color: '#64748b',
            icono: '📦',
            nombre: 'GENERAL',
            nombreTarjeta: 'CARGA MIXTA'
        }
    };

    function normalizarCategoria(categoria) {
        const texto = String(categoria || '').toUpperCase().trim();

        if (!texto) return 'GENERAL';

        if (texto.includes('PISO')) return 'PISO';
        if (texto.includes('BAÑO') || texto.includes('BANO')) return 'BAÑO';
        if (texto.includes('GRIFER')) return 'GRIFERIA';
        if (texto.includes('GENERAL')) return 'GENERAL';

        return 'GENERAL';
    }

    function getCategoryVisual(categoria) {
        const key = normalizarCategoria(categoria);
        return CATEGORY_VISUALS[key] || CATEGORY_VISUALS.GENERAL;
    }

    window.AzUI = {
        CATEGORY_VISUALS,
        normalizarCategoria,
        getCategoryVisual
    };
})();