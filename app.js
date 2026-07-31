// --- STATE & STORAGE ---
const Storage = {
    getTransactions: () => JSON.parse(localStorage.getItem('dt_transactions')) || [],
    saveTransactions: (txs) => localStorage.setItem('dt_transactions', JSON.stringify(txs)),
    getSettings: () => JSON.parse(localStorage.getItem('dt_settings')) || { km_l: 10, price_l: 5.50 },
    saveSettings: (cfg) => localStorage.setItem('dt_settings', JSON.stringify(cfg)),
    getGeminiKey: () => localStorage.getItem('dt_gemini_key') || '',
    saveGeminiKey: (key) => localStorage.setItem('dt_gemini_key', key),
    clearAll: () => {
        localStorage.removeItem('dt_transactions');
        localStorage.removeItem('dt_settings');
        localStorage.removeItem('dt_gemini_key');
    }
};

let transactions = Storage.getTransactions();
let settings = Storage.getSettings();

// --- DOM ELEMENTS ---
const tabs = document.querySelectorAll('.tab-content');
const navItems = document.querySelectorAll('.nav-item');

const lblNetBalance = document.getElementById('lbl-net-balance');
const lblTotalIncome = document.getElementById('lbl-total-income');
const lblTotalExpense = document.getElementById('lbl-total-expense');
const txList = document.getElementById('transactions-list');

const lblMargin = document.getElementById('lbl-margin');
const lblFuelBite = document.getElementById('lbl-fuel-bite');
const lblKmMonth = document.getElementById('lbl-km-month');

const formTransaction = document.getElementById('transaction-form');
const typeIncome = document.getElementById('type-income');
const typeExpense = document.getElementById('type-expense');
const groupCategory = document.getElementById('group-category');
const formSettings = document.getElementById('settings-form');
const btnClearData = document.getElementById('btn-clear-data');

// Input UI Logic
const fuelSwitcher = document.getElementById('fuel-switcher');
const fuelSwitchTabs = document.querySelectorAll('#fuel-switcher .switch-tab');
const inputMoney = document.getElementById('input-money');
const inputKm = document.getElementById('input-km');
const txMoney = document.getElementById('tx-money');
const txKm = document.getElementById('tx-km');
const txDate = document.getElementById('tx-date');
const kmPreview = document.getElementById('km-preview');

let currentInputMode = 'money'; // or 'km'
let lastFuelInputMode = localStorage.getItem('dt_fuel_mode') || 'money';
let currentChartMode = 'month'; // or 'day'
let mgrPeriod = 'month'; // 'month' or 'all'
let editingTxId = null;
let balanceChartInstance = null;
let mgrChartInstance = null;

// Managerial DOM Elements
const lblMgrCostKm = document.getElementById('lbl-mgr-cost-km');
const lblMgrFuelKm = document.getElementById('lbl-mgr-fuel-km');
const lblEvCurrentCost = document.getElementById('lbl-ev-current-cost');
const lblEvSimulatedCost = document.getElementById('lbl-ev-simulated-cost');
const lblEvSavings = document.getElementById('lbl-ev-savings');
const barEvSavings = document.getElementById('bar-ev-savings');
const barFuelCost = document.getElementById('bar-fuel-cost');
const lblEvPercent = document.getElementById('lbl-ev-percent');
const categoryBreakdownList = document.getElementById('category-breakdown-list');

// --- INITIALIZATION ---
function init() {
    // Set default date to today
    txDate.valueAsDate = new Date();
    
    // Load Settings into form
    document.getElementById('cfg-km-l').value = settings.km_l;
    document.getElementById('cfg-price').value = settings.price_l;

    const cfgGeminiKey = document.getElementById('cfg-gemini-key');
    if (cfgGeminiKey) {
        cfgGeminiKey.value = Storage.getGeminiKey();
    }

    updateDashboard();
    setupEventListeners();
    
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW Registered!', reg))
            .catch(err => console.error('SW Error', err));
    }
}

// --- CORE FUNCTIONS ---
function updateDashboard() {
    let inc = 0;
    let exp = 0;
    let fuelExp = 0;
    let kmMonth = 0;

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    // Reset list
    txList.innerHTML = '';

    if(transactions.length === 0) {
        txList.innerHTML = '<div class="empty-state">Sem transações no momento.</div>';
    } else {
        // Sort descending
        const sorted = [...transactions].sort((a,b) => new Date(b.date) - new Date(a.date));
        
        sorted.forEach(tx => {
            if(tx.type === 'income') {
                inc += tx.amount;
            } else {
                exp += tx.amount;
                if(tx.category === 'fuel') fuelExp += tx.amount;
            }

            // Check if tx is from current month for KM calculation
            if(tx.originalKm && tx.date) {
                const parts = tx.date.split('-');
                const d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
                if(d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
                    kmMonth += tx.originalKm;
                }
            }

            // Render Item
            txList.appendChild(createTransactionElement(tx));
        });
    }

    const net = inc - exp;

    lblTotalIncome.textContent = formatMoney(inc);
    lblTotalExpense.textContent = formatMoney(exp);
    lblNetBalance.textContent = formatMoney(net);
    lblNetBalance.style.color = net >= 0 ? '#fff' : 'var(--expense)';
    
    // Metrics calculation
    if(inc > 0) {
        const marginStr = ((net / inc) * 100).toFixed(1);
        lblMargin.textContent = marginStr + '% Margem';
        lblMargin.style.display = 'inline-block';
        lblMargin.style.background = net >= 0 ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)';
        lblMargin.style.color = net >= 0 ? 'var(--income)' : 'var(--expense)';

        const fuelBiteStr = ((fuelExp / inc) * 100).toFixed(1);
        lblFuelBite.innerHTML = `${fuelBiteStr} <small style="font-size: 0.8rem; color: var(--text-muted);">%</small>`;
    } else {
        lblMargin.style.display = 'none';
        lblFuelBite.innerHTML = `0.0 <small style="font-size: 0.8rem; color: var(--text-muted);">%</small>`;
    }

    renderChart();
    if (document.getElementById('tab-managerial')?.classList.contains('active')) {
        updateManagerialView();
    }
}

// --- VISÃO GERENCIAL ---
function updateManagerialView() {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    // Filter transactions by period
    const filtered = transactions.filter(tx => {
        if (mgrPeriod === 'all') return true;
        if (!tx.date) return false;
        const parts = tx.date.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    let totalExpense = 0;
    let fuelExpense = 0;
    let recordedKm = 0;
    let unrecordedFuelMoney = 0;

    const categoryTotals = {
        fuel: 0,
        parking: 0,
        maintenance: 0,
        cleaning: 0,
        ipva: 0
    };

    filtered.forEach(tx => {
        if (tx.type === 'expense') {
            totalExpense += tx.amount;
            if (categoryTotals[tx.category] !== undefined) {
                categoryTotals[tx.category] += tx.amount;
            }
            if (tx.category === 'fuel') {
                fuelExpense += tx.amount;
                if (tx.originalKm > 0) {
                    recordedKm += tx.originalKm;
                } else {
                    unrecordedFuelMoney += tx.amount;
                }
            }
        }
    });

    // Estimate KM for fuel entries recorded in money without KM value
    const kmPerLiter = settings.km_l || 10;
    const pricePerLiter = settings.price_l || 5.50;
    const estimatedKm = (unrecordedFuelMoney / pricePerLiter) * kmPerLiter;

    const effectiveKm = recordedKm + estimatedKm;

    // 1. Custo Total / KM & Combustível / KM
    if (effectiveKm > 0) {
        const costPerKm = totalExpense / effectiveKm;
        const fuelPerKm = fuelExpense / effectiveKm;
        if (lblMgrCostKm) lblMgrCostKm.innerHTML = `${formatMoney(costPerKm)} <small style="font-size: 0.7rem; color: var(--text-muted);">/km</small>`;
        if (lblMgrFuelKm) lblMgrFuelKm.innerHTML = `${formatMoney(fuelPerKm)} <small style="font-size: 0.7rem; color: var(--text-muted);">/km</small>`;
    } else {
        if (lblMgrCostKm) lblMgrCostKm.innerHTML = `R$ 0,00 <small style="font-size: 0.7rem; color: var(--text-muted);">/km</small>`;
        if (lblMgrFuelKm) lblMgrFuelKm.innerHTML = `R$ 0,00 <small style="font-size: 0.7rem; color: var(--text-muted);">/km</small>`;
    }

    // 2. Comparativo Elétrico (R$ 0,10 / KM rodado)
    const evRate = 0.10;
    const simulatedEvCost = effectiveKm * evRate;
    const savings = Math.max(0, fuelExpense - simulatedEvCost);
    const savingsPercent = fuelExpense > 0 ? ((savings / fuelExpense) * 100) : 0;

    if (lblEvCurrentCost) lblEvCurrentCost.textContent = formatMoney(fuelExpense);
    if (lblEvSimulatedCost) lblEvSimulatedCost.textContent = formatMoney(simulatedEvCost);
    if (lblEvSavings) lblEvSavings.textContent = formatMoney(savings);

    if (barEvSavings && barFuelCost && lblEvPercent) {
        if (fuelExpense > 0) {
            const pctSavings = Math.min(100, Math.max(0, savingsPercent));
            barEvSavings.style.width = `${pctSavings}%`;
            barFuelCost.style.width = `${100 - pctSavings}%`;
            lblEvPercent.textContent = `${savingsPercent.toFixed(1)}% de economia em relação ao combustível`;
        } else {
            barEvSavings.style.width = `0%`;
            barFuelCost.style.width = `100%`;
            lblEvPercent.textContent = `Sem gastos de combustível no período`;
        }
    }

    // 3. Charts & List
    renderCategoryChart(categoryTotals, totalExpense);
    renderCategoryList(categoryTotals, totalExpense);
}

function renderCategoryList(totals, totalExp) {
    if (!categoryBreakdownList) return;
    categoryBreakdownList.innerHTML = '';

    const catDetails = [
        { key: 'fuel', label: 'Combustível', icon: 'ri-gas-station-fill', color: '#ef4444' },
        { key: 'parking', label: 'Estacionamento', icon: 'ri-parking-box-fill', color: '#f59e0b' },
        { key: 'maintenance', label: 'Manutenção', icon: 'ri-tools-fill', color: '#6366f1' },
        { key: 'cleaning', label: 'Limpeza & Lavagem', icon: 'ri-sparkling-fill', color: '#0ea5e9' },
        { key: 'ipva', label: 'IPVA & Taxas', icon: 'ri-file-list-3-fill', color: '#d946ef' }
    ];

    if (totalExp === 0) {
        categoryBreakdownList.innerHTML = '<div class="empty-state">Nenhuma despesa registrada no período.</div>';
        return;
    }

    catDetails.forEach(cat => {
        const val = totals[cat.key] || 0;
        if (val > 0) {
            const pct = ((val / totalExp) * 100).toFixed(1);
            const item = document.createElement('div');
            item.className = 'glass';
            item.style.padding = '0.8rem 1rem';
            item.style.borderRadius = '10px';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.background = 'rgba(255, 255, 255, 0.02)';

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.8rem;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: ${cat.color}22; color: ${cat.color}; display: flex; align-items: center; justify-content: center; font-size: 1rem;">
                        <i class="${cat.icon}"></i>
                    </div>
                    <div>
                        <h5 style="font-size: 0.85rem; font-weight: 500; color: #fff;">${cat.label}</h5>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">${pct}% das despesas</span>
                    </div>
                </div>
                <strong style="font-size: 0.95rem; color: #fff;">${formatMoney(val)}</strong>
            `;
            categoryBreakdownList.appendChild(item);
        }
    });
}

function renderCategoryChart(totals, totalExp) {
    const ctx = document.getElementById('categoryChart');
    if (!ctx) return;

    if (mgrChartInstance) {
        mgrChartInstance.destroy();
    }

    if (totalExp === 0) {
        mgrChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Sem despesas'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['rgba(255, 255, 255, 0.08)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
        return;
    }

    const labels = [];
    const data = [];
    const colors = [];

    const colorMap = {
        fuel: '#ef4444',
        parking: '#f59e0b',
        maintenance: '#6366f1',
        cleaning: '#0ea5e9',
        ipva: '#d946ef'
    };

    const labelMap = {
        fuel: 'Combustível',
        parking: 'Estacionamento',
        maintenance: 'Manutenção',
        cleaning: 'Limpeza',
        ipva: 'IPVA/Taxas'
    };

    Object.keys(totals).forEach(key => {
        if (totals[key] > 0) {
            labels.push(labelMap[key]);
            data.push(totals[key]);
            colors.push(colorMap[key]);
        }
    });

    mgrChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderColor: '#1c1e24',
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#9aa0a6',
                        font: { family: 'Outfit', size: 11 },
                        boxWidth: 12,
                        padding: 8
                    }
                }
            },
            cutout: '70%'
        }
    });
}

function createTransactionElement(tx) {
    const div = document.createElement('div');
    div.className = 'tx-item';
    
    let iconClass = 'uber';
    let iconRemix = 'ri-car-fill';
    let title = 'Uber';

    if(tx.type === 'expense') {
        if(tx.category === 'fuel') { iconClass = 'fuel'; iconRemix = 'ri-gas-station-fill'; title = 'Combustível'; }
        if(tx.category === 'parking') { iconClass = 'parking'; iconRemix = 'ri-parking-box-fill'; title = 'Estacionamento'; }
        if(tx.category === 'maintenance') { iconClass = 'maintenance'; iconRemix = 'ri-tools-fill'; title = 'Manutenção'; }
        if(tx.category === 'cleaning') { iconClass = 'cleaning'; iconRemix = 'ri-sparkling-fill'; title = 'Limpeza & Lavagem'; }
        if(tx.category === 'ipva') { iconClass = 'ipva'; iconRemix = 'ri-file-list-3-fill'; title = 'IPVA & Taxas'; }
    }

    const dateStr = new Date(tx.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    const amountStr = (tx.type === 'income' ? '+ ' : '- ') + formatMoney(tx.amount);
    const amountClass = tx.type === 'income' ? 'pos' : 'neg';

    div.innerHTML = `
        <div class="tx-left">
            <div class="tx-icon ${iconClass}">
                <i class="${iconRemix}"></i>
            </div>
            <div class="tx-info">
                <h4>${title}</h4>
                <span>${dateStr}</span>
            </div>
        </div>
        <div class="tx-right ${amountClass}">
            ${amountStr}
        </div>
        <div class="tx-actions">
            <button class="btn-icon tx-edit"><i class="ri-edit-line"></i></button>
            <button class="btn-icon tx-delete"><i class="ri-delete-bin-line"></i></button>
        </div>
    `;

    // Delete
    div.querySelector('.tx-delete').addEventListener('click', () => {
        if(confirm("Deseja apagar esta transação?")) {
            transactions = transactions.filter(t => t.id !== tx.id);
            Storage.saveTransactions(transactions);
            updateDashboard();
        }
    });

    // Edit
    div.querySelector('.tx-edit').addEventListener('click', () => {
        editingTxId = tx.id;
        
        // Go to tab
        navItems.forEach(n => n.classList.remove('active'));
        navItems[1].classList.add('active'); // Add form tab
        tabs.forEach(t => t.classList.remove('active'));
        document.getElementById('tab-add').classList.add('active');

        // Populate fields
        txDate.value = tx.date;
        if(tx.type === 'income') {
            typeIncome.checked = true;
            groupCategory.style.display = 'none';
            fuelSwitcher.style.display = 'none';
            currentInputMode = 'money';
            showMoneyInput();
            txMoney.value = tx.amount;
        } else {
            typeExpense.checked = true;
            groupCategory.style.display = 'flex';
            document.querySelector(`input[name="tx-category"][value="${tx.category}"]`).checked = true;
            
            checkFuelMode();
            if(tx.category === 'fuel' && tx.originalKm > 0) {
                fuelSwitchTabs[1].click(); // Click KM
                txKm.value = tx.originalKm;
                calculateKmToMoney();
            } else {
                fuelSwitchTabs[0].click(); // Click R$
                txMoney.value = tx.amount;
            }
        }
        
        document.querySelector('#transaction-form .btn-primary').textContent = 'Atualizar Transação';
    });

    return div;
}

function formatMoney(value) {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    // Navigation
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            btn.classList.add('active');
            
            tabs.forEach(t => t.classList.remove('active'));
            document.getElementById(btn.dataset.tab).classList.add('active');
            
            if(btn.dataset.tab === 'tab-dashboard') updateDashboard();
            if(btn.dataset.tab === 'tab-managerial') updateManagerialView();
        });
    });

    // Managerial Period Toggle
    const mgrPeriodMonth = document.getElementById('mgr-period-month');
    const mgrPeriodAll = document.getElementById('mgr-period-all');
    if (mgrPeriodMonth && mgrPeriodAll) {
        mgrPeriodMonth.addEventListener('click', () => {
            mgrPeriodMonth.classList.add('active');
            mgrPeriodAll.classList.remove('active');
            mgrPeriod = 'month';
            updateManagerialView();
        });
        mgrPeriodAll.addEventListener('click', () => {
            mgrPeriodAll.classList.add('active');
            mgrPeriodMonth.classList.remove('active');
            mgrPeriod = 'all';
            updateManagerialView();
        });
    }

    // Chart toggle logic
    const chartTabMonth = document.getElementById('chart-tab-month');
    const chartTabDay = document.getElementById('chart-tab-day');
    
    chartTabMonth.addEventListener('click', () => {
        chartTabMonth.classList.add('active');
        chartTabDay.classList.remove('active');
        currentChartMode = 'month';
        renderChart();
    });
    
    chartTabDay.addEventListener('click', () => {
        chartTabDay.classList.add('active');
        chartTabMonth.classList.remove('active');
        currentChartMode = 'day';
        renderChart();
    });

    // Form logic: Toggle Income / Expense
    typeIncome.addEventListener('change', () => {
        groupCategory.style.display = 'none';
        fuelSwitcher.style.display = 'none';
        currentInputMode = 'money';
        showMoneyInput();
    });

    typeExpense.addEventListener('change', () => {
        groupCategory.style.display = 'flex';
        checkFuelMode(); // Show switch if fuel is selected
    });

    // Category Change (Check if fuel)
    const catInputs = document.querySelectorAll('input[name="tx-category"]');
    catInputs.forEach(radio => {
        radio.addEventListener('change', (e) => {
            checkFuelMode();
            if (e.target.value === 'parking') {
                txMoney.placeholder = 'Ex: 20.00';
                if (!txMoney.value) {
                    txMoney.value = '20.00';
                }
            } else {
                txMoney.placeholder = 'Ex: 50.00';
            }
        });
    });

    // Fuel Switcher logic (R$ vs KM)
    fuelSwitchTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            fuelSwitchTabs.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            const target = e.target.dataset.target;
            
            if(target === 'ammount-km') {
                currentInputMode = 'km';
                lastFuelInputMode = 'km';
                localStorage.setItem('dt_fuel_mode', 'km');
                inputMoney.style.display = 'none';
                inputKm.style.display = 'flex';
                txMoney.removeAttribute('required');
                txKm.setAttribute('required', 'true');
                calculateKmToMoney();
            } else {
                currentInputMode = 'money';
                lastFuelInputMode = 'money';
                localStorage.setItem('dt_fuel_mode', 'money');
                showMoneyInput();
            }
        });
    });

    // Live calculation for KM
    txKm.addEventListener('input', calculateKmToMoney);
    document.getElementById('cfg-km-l').addEventListener('input', calculateKmToMoney);
    document.getElementById('cfg-price').addEventListener('input', calculateKmToMoney);

    // Save Transaction
    formTransaction.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const type = typeIncome.checked ? 'income' : 'expense';
        let category = 'uber';
        if(type === 'expense') {
            category = document.querySelector('input[name="tx-category"]:checked').value;
        }

        let amountStr = txMoney.value;
        let kmVal = 0;
        
        if(currentInputMode === 'km') {
            const km = parseFloat(txKm.value) || 0;
            const km_l = parseFloat(document.getElementById('cfg-km-l').value) || 10;
            const price_l = parseFloat(document.getElementById('cfg-price').value) || 5.50;
            
            // Save settings globally so it remembers next time
            settings = { km_l, price_l };
            Storage.saveSettings(settings);

            kmVal = km;
            const calculated = (km / km_l) * price_l;
            amountStr = calculated;
        }

        const newTx = {
            id: editingTxId ? editingTxId : Date.now(),
            type,
            category,
            amount: parseFloat(amountStr),
            date: txDate.value,
            originalKm: kmVal
        };

        if(editingTxId) {
            const idx = transactions.findIndex(t => t.id === editingTxId);
            if(idx > -1) transactions[idx] = newTx;
            editingTxId = null;
            document.querySelector('#transaction-form .btn-primary').textContent = 'Salvar Transação';
        } else {
            transactions.push(newTx);
        }
        Storage.saveTransactions(transactions);

        // Reset form
        formTransaction.reset();
        txDate.valueAsDate = new Date();
        document.getElementById('cfg-km-l').value = settings.km_l;
        document.getElementById('cfg-price').value = settings.price_l;
        typeIncome.checked = true;
        groupCategory.style.display = 'none';
        fuelSwitcher.style.display = 'none';
        showMoneyInput();

        // Navigate back to dash
        navItems[0].click(); 
    });

        // Save Gemini Key
        const btnSaveGeminiKey = document.getElementById('btn-save-gemini-key');
        const cfgGeminiKey = document.getElementById('cfg-gemini-key');
        if (btnSaveGeminiKey && cfgGeminiKey) {
            btnSaveGeminiKey.addEventListener('click', () => {
                const key = cfgGeminiKey.value.trim();
                Storage.saveGeminiKey(key);
                alert(key ? "Chave da API Gemini salva com sucesso! O scanner de painel está pronto para uso." : "Chave da API Gemini removida.");
            });
        }

        // Scanner Buttons
        const btnScanDashboard = document.getElementById('btn-scan-dashboard');
        const fileDashboard = document.getElementById('file-dashboard');
        if (btnScanDashboard && fileDashboard) {
            btnScanDashboard.addEventListener('click', () => {
                const apiKey = Storage.getGeminiKey();
                if (!apiKey) {
                    alert("Por favor, cadastre sua chave gratuita da API do Gemini na aba Configurações antes de usar o scanner!");
                    navItems[3].click();
                    if (cfgGeminiKey) cfgGeminiKey.focus();
                    return;
                }
                fileDashboard.click();
            });

            fileDashboard.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    processDashboardImage(e.target.files[0]);
                    e.target.value = '';
                }
            });
        }

        // CSV Export & Import
        const btnExportCsv = document.getElementById('btn-export-csv');
        const btnImportCsv = document.getElementById('btn-import-csv');
        const fileImportCsv = document.getElementById('file-import-csv');

        if (btnExportCsv) {
            btnExportCsv.addEventListener('click', exportTransactionsCSV);
        }

        if (btnImportCsv && fileImportCsv) {
            btnImportCsv.addEventListener('click', () => fileImportCsv.click());
            fileImportCsv.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    importTransactionsCSV(e.target.files[0]);
                    e.target.value = '';
                }
            });
        }

        // Clear Data
        btnClearData.addEventListener('click', () => {
            if(confirm("Tem certeza que deseja apagar TODOS os seus registros?")) {
                Storage.clearAll();
                transactions = [];
                settings = { km_l: 10, price_l: 5.50 };
                document.getElementById('cfg-km-l').value = settings.km_l;
                document.getElementById('cfg-price').value = settings.price_l;
                if (cfgGeminiKey) cfgGeminiKey.value = '';
                updateDashboard();
                alert("Dados apagados!");
            }
        });
    }

// --- CSV EXPORT & IMPORT LOGIC ---
function exportTransactionsCSV() {
    if (transactions.length === 0) {
        alert("Nenhuma transação encontrada para exportar.");
        return;
    }

    const BOM = "\uFEFF"; // UTF-8 BOM for Excel compatibility
    let csvContent = BOM + "ID;Data;Tipo;Categoria;Valor_R$;KM_Original\n";

    transactions.forEach(tx => {
        const id = tx.id || '';
        const date = tx.date || '';
        const type = tx.type === 'income' ? 'Receita' : 'Despesa';
        const category = tx.category || '';
        const amount = (tx.amount || 0).toFixed(2).replace('.', ',');
        const km = (tx.originalKm || 0).toFixed(1).replace('.', ',');

        csvContent += `${id};${date};${type};${category};${amount};${km}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `deslocatrack_backup_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function importTransactionsCSV(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            const lines = content.split(/\r\n|\n/);

            if (lines.length <= 1) {
                alert("O arquivo CSV está vazio ou em formato inválido.");
                return;
            }

            const firstLine = lines[0];
            const delimiter = firstLine.includes(';') ? ';' : ',';

            let importedCount = 0;
            const newTransactions = [...transactions];

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const cols = line.split(delimiter);
                if (cols.length < 4) continue;

                let id, date, typeStr, category, amountStr, kmStr;

                if (cols.length >= 6) {
                    id = cols[0].trim();
                    date = cols[1].trim();
                    typeStr = cols[2].trim().toLowerCase();
                    category = cols[3].trim().toLowerCase();
                    amountStr = cols[4].trim();
                    kmStr = cols[5].trim();
                } else {
                    date = cols[0].trim();
                    typeStr = cols[1].trim().toLowerCase();
                    category = cols[2].trim().toLowerCase();
                    amountStr = cols[3].trim();
                    kmStr = cols[4] ? cols[4].trim() : '0';
                }

                const type = (typeStr.includes('receita') || typeStr.includes('income') || typeStr.includes('uber')) ? 'income' : 'expense';
                const amount = parseFloat(amountStr.replace('R$', '').replace(' ', '').replace(',', '.')) || 0;
                const km = parseFloat(kmStr.replace(',', '.')) || 0;

                if (!date || isNaN(amount) || amount <= 0) continue;

                const txId = id ? (parseInt(id) || (Date.now() + Math.random())) : (Date.now() + Math.random());

                // Prevent duplicate entries
                if (!newTransactions.some(t => t.id === txId)) {
                    newTransactions.push({
                        id: txId,
                        date: date,
                        type: type,
                        category: category || (type === 'income' ? 'uber' : 'fuel'),
                        amount: amount,
                        originalKm: km
                    });
                    importedCount++;
                }
            }

            if (importedCount > 0) {
                transactions = newTransactions;
                Storage.saveTransactions(transactions);
                updateDashboard();
                if (document.getElementById('tab-managerial')?.classList.contains('active')) {
                    updateManagerialView();
                }
                alert(`✅ Sucesso! ${importedCount} transações foram importadas.`);
            } else {
                alert("Nenhuma nova transação válida foi encontrada no CSV (registros já existentes ou colunas inválidas).");
            }
        } catch (err) {
            console.error('Erro na importação CSV:', err);
            alert("Ocorreu um erro ao processar o arquivo CSV. Verifique a formatação.");
        }
    };
    reader.readAsText(file, 'UTF-8');
}

// --- GEMINI VISION SCANNER LOGIC ---
async function processDashboardImage(file) {
    const apiKey = Storage.getGeminiKey();
    if (!apiKey) {
        alert("Por favor, cadastre sua chave gratuita da API do Gemini na aba Configurações antes de escanear!");
        navItems[3].click();
        return;
    }

    const overlay = document.getElementById('ai-loading-overlay');
    if (overlay) overlay.style.display = 'flex';

    try {
        const base64Data = await fileToBase64(file);
        const mimeType = file.type || 'image/jpeg';

        const promptText = `Analise esta foto do painel de um veículo (carro ou caminhão).
Extraia se visíveis:
1. Distância percorrida em KM (trip, parcial, trecho ou odômetro).
2. Consumo médio em KM/L.

Responda APENAS com um JSON estrito no seguinte formato exato:
{"km": 123.4, "km_l": 12.5}

Se algum dos dois campos não for encontrado na imagem, retorne null nele. Não inclua NENHUM outro texto ou marcação markdown.`;

        const requestBody = {
            contents: [
                {
                    parts: [
                        { text: promptText },
                        {
                            inline_data: {
                                mime_type: mimeType,
                                data: base64Data
                            }
                        }
                    ]
                }
            ]
        };

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errJson = await response.json().catch(() => ({}));
            throw new Error(errJson.error?.message || `Erro na resposta da API Gemini (${response.status})`);
        }

        const data = await response.json();
        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        const jsonMatch = textResult.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Não foi possível interpretar a resposta da IA como JSON.");
        }

        const parsed = JSON.parse(jsonMatch[0]);

        if (overlay) overlay.style.display = 'none';

        if ((parsed.km === null || parsed.km === undefined) && (parsed.km_l === null || parsed.km_l === undefined)) {
            alert("A IA Gemini não encontrou números de KM ou KM/L com clareza nesta foto. Tente tirar outra foto mais próxima e iluminada do painel.");
            return;
        }

        // Apply results to form
        typeExpense.checked = true;
        groupCategory.style.display = 'flex';
        document.getElementById('cat-fuel').checked = true;
        checkFuelMode();

        // Switch to KM mode
        fuelSwitchTabs[1].click();

        if (parsed.km !== null && parsed.km !== undefined && !isNaN(parsed.km)) {
            txKm.value = parsed.km;
        }

        if (parsed.km_l !== null && parsed.km_l !== undefined && !isNaN(parsed.km_l)) {
            document.getElementById('cfg-km-l').value = parsed.km_l;
        }

        calculateKmToMoney();

        let msg = "✨ Painel Lido com Sucesso pela IA Gemini!\n\n";
        if (parsed.km) msg += `• Distância: ${parsed.km} KM\n`;
        if (parsed.km_l) msg += `• Consumo: ${parsed.km_l} KM/L\n`;
        msg += "\nOs campos foram preenchidos automaticamente no formulário!";

        alert(msg);

    } catch (err) {
        if (overlay) overlay.style.display = 'none';
        console.error('Erro no Scanner Gemini:', err);
        alert(`Erro ao analisar painel: ${err.message}`);
    }
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

function checkFuelMode() {
    const isFuelSelected = document.getElementById('cat-fuel').checked;
    if(isFuelSelected) {
        fuelSwitcher.style.display = 'flex';
        if(lastFuelInputMode === 'km') {
            fuelSwitchTabs[1].click(); // Activate KM mode
        } else {
            fuelSwitchTabs[0].click(); // Activate R$ mode
        }
    } else {
        fuelSwitcher.style.display = 'none';
        currentInputMode = 'money';
        showMoneyInput();
        // Reset switch visually to money
        fuelSwitchTabs[0].classList.add('active');
        fuelSwitchTabs[1].classList.remove('active');
    }
}

function showMoneyInput() {
    inputMoney.style.display = 'flex';
    inputKm.style.display = 'none';
    txKm.removeAttribute('required');
    txMoney.setAttribute('required', 'true');
}

function calculateKmToMoney() {
    const km = parseFloat(txKm.value) || 0;
    const km_l = parseFloat(document.getElementById('cfg-km-l').value) || 10;
    const price_l = parseFloat(document.getElementById('cfg-price').value) || 5.50;

    const val = (km / km_l) * price_l;
    kmPreview.textContent = formatMoney(val) + " calculado";
}

// --- CHART LOGIC ---
function renderChart() {
    const ctx = document.getElementById('balanceChart');
    if(!ctx) return;
    
    if(balanceChartInstance) {
        balanceChartInstance.destroy();
    }

    const labels = [];
    const incomeData = [];
    const expenseData = [];

    const now = new Date();
    const currYear = now.getFullYear();
    const currMonth = now.getMonth();

    if(currentChartMode === 'month') {
        const monthsStr = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        for(let i=0; i<12; i++) {
            labels.push(monthsStr[i]);
            incomeData.push(0);
            expenseData.push(0);
        }

        transactions.forEach(tx => {
            if(!tx.date) return;
            const parts = tx.date.split('-');
            const d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
            
            if(d.getFullYear() === currYear) {
                const mIdx = d.getMonth();
                if(tx.type === 'income') incomeData[mIdx] += tx.amount;
                else expenseData[mIdx] += tx.amount;
            }
        });
    } else {
        const daysInMonth = new Date(currYear, currMonth + 1, 0).getDate();
        for(let i=1; i<=daysInMonth; i++) {
            labels.push(i.toString());
            incomeData.push(0);
            expenseData.push(0);
        }

        transactions.forEach(tx => {
            if(!tx.date) return;
            const parts = tx.date.split('-');
            const d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));

            if(d.getFullYear() === currYear && d.getMonth() === currMonth) {
                const dayIdx = d.getDate();
                if(tx.type === 'income') incomeData[dayIdx-1] += tx.amount;
                else expenseData[dayIdx-1] += tx.amount;
            }
        });
    }

    const netData = [];
    for(let i=0; i<labels.length; i++) {
        netData.push(incomeData[i] - expenseData[i]);
    }

    balanceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    type: 'line',
                    label: 'Resultado Final',
                    data: netData,
                    borderColor: '#a5b4fc', // Light blue/purple from CSS primary
                    backgroundColor: '#a5b4fc',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    pointBackgroundColor: '#a5b4fc',
                    pointRadius: 3
                },
                {
                    label: 'Receitas',
                    data: incomeData,
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'Despesas',
                    data: expenseData,
                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            color: '#9aa0a6',
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#9aa0a6', font: { size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#9aa0a6', font: { size: 10 } }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// PWA Install Prompt logic (Optional wrapper)
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('pwa-install-prompt').style.display = 'block';
});

document.getElementById('btn-install').addEventListener('click', async () => {
    if(deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if(outcome === 'accepted') {
            document.getElementById('pwa-install-prompt').style.display = 'none';
        }
        deferredPrompt = null;
    }
});
document.getElementById('btn-close-pwa').addEventListener('click', () => {
    document.getElementById('pwa-install-prompt').style.display = 'none';
});

// Run Init
init();
