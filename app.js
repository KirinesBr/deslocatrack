// --- STATE & STORAGE ---
const Storage = {
    getTransactions: () => JSON.parse(localStorage.getItem('dt_transactions')) || [],
    saveTransactions: (txs) => localStorage.setItem('dt_transactions', JSON.stringify(txs)),
    getSettings: () => JSON.parse(localStorage.getItem('dt_settings')) || { km_l: 10, price_l: 5.50 },
    saveSettings: (cfg) => localStorage.setItem('dt_settings', JSON.stringify(cfg)),
    clearAll: () => {
        localStorage.removeItem('dt_transactions');
        localStorage.removeItem('dt_settings');
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
let editingTxId = null;
let balanceChartInstance = null;

// --- INITIALIZATION ---
function init() {
    // Set default date to today
    txDate.valueAsDate = new Date();
    
    // Load Settings into form
    document.getElementById('cfg-km-l').value = settings.km_l;
    document.getElementById('cfg-price').value = settings.price_l;

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

    lblKmMonth.innerHTML = `${kmMonth.toFixed(1)} <small style="font-size: 0.8rem; color: var(--text-muted);">KM</small>`;
    
    renderChart();
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
        });
    });

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

    // Clear Data
    btnClearData.addEventListener('click', () => {
        if(confirm("Tem certeza que deseja apagar TODOS os seus registros?")) {
            Storage.clearAll();
            transactions = [];
            settings = { km_l: 10, price_l: 5.50 };
            document.getElementById('cfg-km-l').value = settings.km_l;
            document.getElementById('cfg-price').value = settings.price_l;
            updateDashboard();
            alert("Dados apagados!");
        }
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
