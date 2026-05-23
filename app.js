// app.js - Golden Razor Barbershop SPA Engine
// Utiliza LocalStorage para base de datos local y Web Crypto API para seguridad de contraseña.

// Helper for SHA-256 hashing using browser native Web Crypto API
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hash));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------
// 1. BASE DE DATOS LOCAL & SIMULACIÓN BACKEND
// ---------------------------------------------
const DB_VERSION = "1.0";
const WHATSAPP_NUM = "04149101195"; // Barbería WhatsApp
const SERVICE_PRICES = {
    "Corte": 6.00,
    "Solo Corte": 6.00,
    "Barba": 3.00,
    "Solo Barba": 3.00,
    "Corte y barba": 8.00,
    "Corte y Barba": 8.00
};

// Initial data templates
const INITIAL_BARBEROS = [
    { id: 1, nombre: "Gabriel Dávila", monto_mes: 0.00 },
    { id: 2, nombre: "Génesis", monto_mes: 0.00 },
    { id: 3, nombre: "Leonardo", monto_mes: 0.00 },
    { id: 4, nombre: "Gabriel Díaz", monto_mes: 0.00 },
    { id: 5, nombre: "Heidy", monto_mes: 0.00 },
    { id: 6, nombre: "Rubén", monto_mes: 0.00 }
];

const TIME_SLOTS = [
    "08:00 AM - 08:45 AM",
    "08:45 AM - 09:30 AM",
    "09:30 AM - 10:15 AM",
    "10:15 AM - 11:00 AM",
    "11:00 AM - 11:45 AM",
    "11:45 AM - 12:30 PM",
    "12:30 PM - 01:15 PM",
    "01:15 PM - 02:00 PM",
    "02:00 PM - 02:45 PM",
    "02:45 PM - 03:30 PM",
    "03:30 PM - 04:15 PM",
    "04:15 PM - 05:00 PM"
];

// Initialize DB in localStorage
async function initLocalDatabase() {
    if (!localStorage.getItem('barberos')) {
        localStorage.setItem('barberos', JSON.stringify(INITIAL_BARBEROS));
    }
    if (!localStorage.getItem('turnos')) {
        localStorage.setItem('turnos', JSON.stringify([]));
    }
    if (!localStorage.getItem('admin_hash')) {
        // Pre-hash password "AdminOro2026"
        const hash = await hashPassword("AdminOro2026");
        localStorage.setItem('admin_hash', hash);
        localStorage.setItem('admin_user', 'admin@tubarberia.com');
    }
}

// Hybrid API Layer: Auto-detects if running on a real web server or opened directly as local file.
// If served over HTTP/S, uses fetch to connect to the backend database server.
// If opened directly from filesystem (file://), falls back to localStorage simulation.
const isWebServer = window.location.protocol.startsWith('http');

const api = {
    async login(usuario, password) {
        if (isWebServer) {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario, password })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Error de autenticación');
            }
            return data;
        } else {
            // LocalStorage fallback
            return new Promise(async (resolve, reject) => {
                setTimeout(async () => {
                    const storedUser = localStorage.getItem('admin_user');
                    const storedHash = localStorage.getItem('admin_hash');
                    const hashedInput = await hashPassword(password);
                    
                    if (usuario.toLowerCase().trim() === storedUser && hashedInput === storedHash) {
                        resolve({ success: true, user: storedUser });
                    } else {
                        reject(new Error("Usuario o contraseña incorrectos."));
                    }
                }, 800);
            });
        }
    },

    async getBarberos() {
        if (isWebServer) {
            const res = await fetch('/api/barberos');
            const data = await res.json();
            return data.barberos;
        } else {
            // LocalStorage fallback
            return new Promise((resolve) => {
                const data = JSON.parse(localStorage.getItem('barberos') || '[]');
                resolve(data);
            });
        }
    },

    async getAgenda(barberoId, fecha) {
        if (isWebServer) {
            const res = await fetch(`/api/agenda?barbero_id=${barberoId}&fecha=${fecha}`);
            const data = await res.json();
            return data.agenda;
        } else {
            // LocalStorage fallback
            return new Promise((resolve) => {
                const turnos = JSON.parse(localStorage.getItem('turnos') || '[]');
                
                const agenda = TIME_SLOTS.map(slot => {
                    const booking = turnos.find(
                        t => t.barbero_id === parseInt(barberoId) && t.fecha === fecha && t.hora === slot
                    );
                    return {
                        hora: slot,
                        estado: booking ? 'Agendado' : 'Disponible',
                        cliente_nombre: booking ? booking.cliente_nombre : null,
                        servicio: booking ? booking.servicio : null
                    };
                });
                resolve(agenda);
            });
        }
    },

    async agendarCita(barberoId, fecha, hora, servicio, clienteNombre) {
        if (isWebServer) {
            const res = await fetch('/api/agendar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    barbero_id: parseInt(barberoId), 
                    fecha, 
                    hora, 
                    servicio, 
                    cliente_nombre: clienteNombre 
                })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Error al agendar cita');
            }
            return data;
        } else {
            // LocalStorage fallback
            return new Promise((resolve, reject) => {
                const turnos = JSON.parse(localStorage.getItem('turnos') || '[]');
                const barberos = JSON.parse(localStorage.getItem('barberos') || '[]');
                
                // Check double-booking
                const alreadyBooked = turnos.some(
                    t => t.barbero_id === parseInt(barberoId) && t.fecha === fecha && t.hora === hora
                );
                
                if (alreadyBooked) {
                    reject(new Error("Este horario ya se encuentra ocupado."));
                    return;
                }

                // Save new appointment
                const newAppointment = {
                    id: Date.now(),
                    barbero_id: parseInt(barberoId),
                    fecha: fecha,
                    hora: hora,
                    servicio: servicio,
                    cliente_nombre: clienteNombre || 'Cliente Web',
                    estado: 'Agendado'
                };
                
                turnos.push(newAppointment);
                localStorage.setItem('turnos', JSON.stringify(turnos));

                // Sum monthly earnings
                const price = SERVICE_PRICES[servicio] || 0.00;
                const updatedBarberos = barberos.map(b => {
                    if (b.id === parseInt(barberoId)) {
                        b.monto_mes = parseFloat((b.monto_mes + price).toFixed(2));
                    }
                    return b;
                });
                localStorage.setItem('barberos', JSON.stringify(updatedBarberos));

                resolve({ success: true, appt: newAppointment, price: price });
            });
        }
    },

    async resetMonth() {
        if (isWebServer) {
            const res = await fetch('/api/admin/reset-month', {
                method: 'POST'
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || 'Error al reiniciar contadores');
            }
            return data;
        } else {
            // LocalStorage fallback
            return new Promise((resolve) => {
                // Reset earnings to 0
                const resetBarberos = INITIAL_BARBEROS.map(b => ({ ...b, monto_mes: 0.00 }));
                localStorage.setItem('barberos', JSON.stringify(resetBarberos));
                
                // Clear turnos/appointments
                localStorage.setItem('turnos', JSON.stringify([]));
                resolve({ success: true });
            });
        }
    }
};

// ---------------------------------------------
// 2. LÓGICA DE LA INTERFAZ DE USUARIO (SPA)
// ---------------------------------------------

// Local State
let selectedBarberId = 1;
let selectedDate = "";
let selectedSlotTime = "";
let activeSection = "inicio";
let logoBase64 = null; // Stored base64 image for PDF

document.addEventListener("DOMContentLoaded", async () => {
    // Initialize DB
    await initLocalDatabase();
    
    // Set default selected date (today)
    setDefaultDates();

    // Setup Navigation Routing
    setupRouter();

    // Render Public Barber Selector & Slots
    await renderPublicBarberTabs();
    await refreshPublicSchedule();

    // Initialize Admin Dashboard view if logged in previously
    checkAdminSession();

    // Form Event Listeners
    setupFormListeners();

    // PDF buttons listeners
    setupPdfListeners();

    // Load logo as base64 for PDF
    preloadLogoBase64();
});

// Load the local logo image and convert it to Base64 asynchronously for jsPDF
function preloadLogoBase64() {
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = this.naturalWidth;
        canvas.height = this.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this, 0, 0);
        logoBase64 = canvas.toDataURL('image/jpeg');
    };
    img.onerror = function() {
        console.warn("No se pudo cargar images/logo.jpg para el reporte PDF. Usando vector alternativo.");
    };
    img.src = 'images/logo.jpg';
}

// Set date inputs to today's date in local time zone
function setDefaultDates() {
    const todayLocal = new Date();
    const offset = todayLocal.getTimezoneOffset();
    const todayAdjusted = new Date(todayLocal.getTime() - (offset * 60 * 1000));
    const todayStr = todayAdjusted.toISOString().split('T')[0];
    
    selectedDate = todayStr;
    document.getElementById("public-date-picker").value = todayStr;
    document.getElementById("cashier-fecha").value = todayStr;
    
    // Set min date of picker to today
    document.getElementById("public-date-picker").min = todayStr;
    document.getElementById("cashier-fecha").min = todayStr;

    // Set header date in report preview
    const dateText = todayLocal.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById("report-current-date").textContent = `Fecha: ${dateText}`;
}

// Router Setup
function setupRouter() {
    const navItems = document.querySelectorAll(".nav-item, .scroll-trigger");
    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            let targetId = item.getAttribute("href").substring(1);
            
            if (targetId) {
                // If it was a menu click on mobile or home scroll
                if (item.classList.contains("scroll-trigger")) {
                    targetId = "agenda";
                }
                
                navigateToSection(targetId);
                
                // Update active class in menu
                document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
                const activeNav = document.querySelector(`.nav-item[href="#${targetId}"]`);
                if (activeNav) activeNav.classList.add("active");
            }
        });
    });

    // Handle initial hash in URL if present
    const hash = window.location.hash.substring(1);
    if (hash && ["inicio", "agenda", "admin-section"].includes(hash)) {
        navigateToSection(hash);
        document.querySelectorAll(".nav-item").forEach(nav => nav.classList.remove("active"));
        const activeNav = document.querySelector(`.nav-item[href="#${hash}"]`);
        if (activeNav) activeNav.classList.add("active");
    }
}

function navigateToSection(sectionId) {
    activeSection = sectionId;
    document.querySelectorAll(".spa-section").forEach(sec => {
        sec.classList.remove("active");
    });
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add("active");
        
        // Actions on load
        if (sectionId === "agenda") {
            refreshPublicSchedule();
        } else if (sectionId === "admin-section") {
            checkAdminSession();
        }
    }
}

// Check if admin session persists
function checkAdminSession() {
    const isLoggedIn = sessionStorage.getItem("adminLoggedIn") === "true";
    const loginContainer = document.getElementById("login-container");
    const dashboardContainer = document.getElementById("dashboard-container");
    const adminNavBtn = document.getElementById("admin-nav-btn");

    if (isLoggedIn) {
        loginContainer.classList.remove("active");
        dashboardContainer.classList.remove("hide");
        adminNavBtn.innerHTML = `<i class="fa-solid fa-screwdriver-wrench"></i> Panel Admin`;
        loadAdminDashboardData();
    } else {
        loginContainer.classList.add("active");
        dashboardContainer.classList.add("hide");
        adminNavBtn.innerHTML = `<i class="fa-solid fa-lock"></i> Admin`;
    }
}

// ---------------------------------------------
// 3. SECCIÓN AGENDA PÚBLICA INTERACTIVA
// ---------------------------------------------

// Render Barber Tabs on Public Screen
async function renderPublicBarberTabs() {
    const barbers = await api.getBarberos();
    const tabsContainer = document.getElementById("public-barber-tabs");
    tabsContainer.innerHTML = "";
    
    barbers.forEach((barber, index) => {
        const tab = document.createElement("button");
        tab.className = `barber-tab ${barber.id === selectedBarberId ? 'active' : ''}`;
        tab.innerHTML = `<i class="fa-solid fa-user-tie"></i> ${barber.nombre}`;
        tab.addEventListener("click", () => {
            selectedBarberId = barber.id;
            document.querySelectorAll(".barber-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            refreshPublicSchedule();
        });
        tabsContainer.appendChild(tab);
    });
}

// Refresh Time Slots display on Public Screen
async function refreshPublicSchedule() {
    const pickerVal = document.getElementById("public-date-picker").value;
    if (pickerVal) {
        selectedDate = pickerVal;
    }
    
    const agenda = await api.getAgenda(selectedBarberId, selectedDate);
    const slotsGrid = document.getElementById("public-slots-grid");
    slotsGrid.innerHTML = "";

    agenda.forEach(slot => {
        const slotBtn = document.createElement("button");
        slotBtn.className = `slot-btn ${slot.estado === 'Agendado' ? 'booked' : 'available'}`;
        
        const isBooked = slot.estado === 'Agendado';
        
        slotBtn.innerHTML = `
            <span class="slot-time"><i class="fa-regular fa-clock"></i> ${slot.hora.split(' - ')[0]}</span>
            <span class="slot-status">${isBooked ? 'Agendado' : 'Disponible'}</span>
        `;

        if (!isBooked) {
            slotBtn.addEventListener("click", () => {
                openBookingModal(slot.hora);
            });
        }
        
        slotsGrid.appendChild(slotBtn);
    });
}

// Handle date picker changes
document.getElementById("public-date-picker").addEventListener("change", (e) => {
    selectedDate = e.target.value;
    refreshPublicSchedule();
});

// Floating WhatsApp CTA click handler
document.getElementById("floating-whatsapp-btn").addEventListener("click", (e) => {
    // Generate general WhatsApp link
    const text = "Hola Golden Razor Barbershop! Quisiera hacer una consulta o reservar un turno.";
    document.getElementById("floating-whatsapp-btn").href = `https://wa.me/584149101195?text=${encodeURIComponent(text)}`;
});

// Modal Logic for Public Booking
const bookingModal = document.getElementById("booking-modal");

async function openBookingModal(slotTime) {
    selectedSlotTime = slotTime;
    
    const barbers = await api.getBarberos();
    const activeBarber = barbers.find(b => b.id === selectedBarberId);
    
    // Format Date for humans
    const parts = selectedDate.split("-");
    const dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;

    // Fill details
    document.getElementById("modal-summary-barber").textContent = activeBarber ? activeBarber.nombre : "--";
    document.getElementById("modal-summary-date").textContent = dateFormatted;
    document.getElementById("modal-summary-time").textContent = slotTime;
    document.getElementById("public-client-name").value = "";

    // Show modal
    bookingModal.classList.add("active");
}

function closeBookingModal() {
    bookingModal.classList.remove("active");
}

document.getElementById("modal-close-btn").addEventListener("click", closeBookingModal);
bookingModal.addEventListener("click", (e) => {
    if (e.target === bookingModal) closeBookingModal();
});

// ---------------------------------------------
// 4. LÓGICA DE FORMULARIOS Y CAJA (ADMIN)
// ---------------------------------------------
function setupFormListeners() {
    // Admin Login form submit
    const loginForm = document.getElementById("login-form");
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const email = document.getElementById("login-email").value;
        const pass = document.getElementById("login-password").value;
        const errorMsg = document.getElementById("login-error-msg");
        const btnText = document.getElementById("login-btn-text");
        const btnSpinner = document.getElementById("login-btn-spinner");

        // UI Feedback
        errorMsg.classList.add("hide");
        btnText.classList.add("hide");
        btnSpinner.classList.remove("hide");

        try {
            const res = await api.login(email, pass);
            if (res.success) {
                sessionStorage.setItem("adminLoggedIn", "true");
                checkAdminSession();
            }
        } catch (err) {
            errorMsg.classList.remove("hide");
        } finally {
            btnText.classList.remove("hide");
            btnSpinner.classList.add("hide");
        }
    });

    // Admin Logout button
    document.getElementById("logout-btn").addEventListener("click", () => {
        sessionStorage.removeItem("adminLoggedIn");
        checkAdminSession();
    });

    // Public booking form submission (Sends details to local storage and WhatsApp)
    const publicBookingForm = document.getElementById("public-booking-form");
    publicBookingForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const clientName = document.getElementById("public-client-name").value.trim();
        const serviceSelect = document.getElementById("public-service");
        const serviceName = serviceSelect.value;
        const servicePrice = serviceSelect.options[serviceSelect.selectedIndex].getAttribute("data-price");
        
        const barbers = await api.getBarberos();
        const activeBarber = barbers.find(b => b.id === selectedBarberId);
        
        try {
            // Book in simulated database
            const res = await api.agendarCita(selectedBarberId, selectedDate, selectedSlotTime, serviceName, clientName);
            if (res.success) {
                // Formulate WhatsApp message text
                const parts = selectedDate.split("-");
                const dateMsg = `${parts[2]}/${parts[1]}/${parts[0]}`;
                
                const messageText = `Hola! Vengo de su página web y quiero confirmar la reserva de mi cita:\n\n` + 
                    `💈 *Barbero:* ${activeBarber.nombre}\n` +
                    `📅 *Fecha:* ${dateMsg}\n` +
                    `⏰ *Hora:* ${selectedSlotTime}\n` +
                    `✂️ *Servicio:* ${serviceName} ($${servicePrice})\n` +
                    `👤 *Cliente:* ${clientName}\n\n` +
                    `¡Muchas gracias!`;
                
                const waUrl = `https://wa.me/584121234567?text=${encodeURIComponent(messageText)}`;
                
                // Open WhatsApp link in new window
                window.open(waUrl, "_blank");
                
                // Close modal & reload slots
                closeBookingModal();
                refreshPublicSchedule();
                
                // Reload dashboard just in case
                if (sessionStorage.getItem("adminLoggedIn") === "true") {
                    loadAdminDashboardData();
                }
            }
        } catch (err) {
            alert(err.message || "Error al agendar la cita.");
        }
    });

    // Admin Cashier scheduler form submit
    const cashierForm = document.getElementById("cashier-booking-form");
    cashierForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const barberId = parseInt(document.getElementById("cashier-barbero").value);
        const fecha = document.getElementById("cashier-fecha").value;
        const hora = document.getElementById("cashier-hora").value;
        const servicio = document.getElementById("cashier-servicio").value;
        const clientName = document.getElementById("cashier-cliente").value.trim();

        if (!hora || hora === "") {
            alert("No hay turnos disponibles para el barbero y fecha seleccionados.");
            return;
        }

        try {
            const res = await api.agendarCita(barberId, fecha, hora, servicio, clientName);
            if (res.success) {
                alert(`Cita agendada con éxito en caja. Monto sumado: $${res.price.toFixed(2)}`);
                // Reset form fields
                document.getElementById("cashier-cliente").value = "";
                
                // Refresh data
                await loadAdminDashboardData();
                refreshPublicSchedule();
            }
        } catch (err) {
            alert(err.message || "Error al agendar cita.");
        }
    });

    // Update Price display in cashier form on select change
    const cashierServSelect = document.getElementById("cashier-servicio");
    cashierServSelect.addEventListener("change", () => {
        const option = cashierServSelect.options[cashierServSelect.selectedIndex];
        const price = option.getAttribute("data-price");
        document.getElementById("cashier-calculated-price").textContent = `$${price}`;
    });

    // Reload hours in cashier when barbero or date changes
    const cashierBarberSelect = document.getElementById("cashier-barbero");
    const cashierDateInput = document.getElementById("cashier-fecha");
    
    cashierBarberSelect.addEventListener("change", updateCashierHours);
    cashierDateInput.addEventListener("change", updateCashierHours);
}

// Populate hours that are not yet booked AND render daily occupied list (Guarantees double-booking prevention in Admin UI)
async function updateCashierHours() {
    const barberIdStr = document.getElementById("cashier-barbero").value;
    const fecha = document.getElementById("cashier-fecha").value;
    const hourSelect = document.getElementById("cashier-hora");
    const bookedList = document.getElementById("admin-booked-slots-list");
    
    if (!barberIdStr || !fecha) return;

    const barberId = parseInt(barberIdStr);
    const agenda = await api.getAgenda(barberId, fecha);
    
    // 1. Populate dropdown (only show Disponible hours)
    hourSelect.innerHTML = "";
    const availableSlots = agenda.filter(slot => slot.estado === 'Disponible');
    
    if (availableSlots.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Sin turnos disponibles";
        hourSelect.appendChild(opt);
    } else {
        availableSlots.forEach(slot => {
            const opt = document.createElement("option");
            opt.value = slot.hora;
            opt.textContent = slot.hora;
            hourSelect.appendChild(opt);
        });
    }

    // 2. Render visual list of Occupied Slots (No double-booking block)
    bookedList.innerHTML = "";
    const bookedSlots = agenda.filter(slot => slot.estado === 'Agendado');
    
    if (bookedSlots.length === 0) {
        bookedList.innerHTML = `
            <div class="no-booked-slots">
                <i class="fa-solid fa-circle-check"></i> Todos los turnos de este día están disponibles.
            </div>
        `;
    } else {
        bookedSlots.forEach(slot => {
            const item = document.createElement("div");
            item.className = "admin-booked-item";
            item.innerHTML = `
                <span class="booked-time"><i class="fa-regular fa-clock text-danger"></i> ${slot.hora.split(' - ')[0]}</span>
                <span class="booked-details"><i class="fa-solid fa-circle-user gold-text"></i> ${slot.cliente_nombre} (${slot.servicio})</span>
            `;
            bookedList.appendChild(item);
        });
    }
}

// ---------------------------------------------
// 5. CARGA DE DATOS DEL PANEL ADMINISTRATIVO
// ---------------------------------------------
async function loadAdminDashboardData() {
    const barbers = await api.getBarberos();
    
    // Fill cashier barber options
    const cashierBarberSelect = document.getElementById("cashier-barbero");
    const previousVal = cashierBarberSelect.value;
    cashierBarberSelect.innerHTML = "";
    
    barbers.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b.id;
        opt.textContent = b.nombre;
        cashierBarberSelect.appendChild(opt);
    });
    
    if (previousVal && barbers.some(b => b.id === parseInt(previousVal))) {
        cashierBarberSelect.value = previousVal;
    }

    // Load hours for current barbero selection in Cashier & occupied list
    await updateCashierHours();

    // Render Matrix of Performance
    const perfList = document.getElementById("barbers-performance-list");
    perfList.innerHTML = "";
    
    let totalGeneral = 0;
    
    barbers.forEach(b => {
        totalGeneral += b.monto_mes;
        
        const item = document.createElement("div");
        item.className = "barber-report-item";
        item.innerHTML = `
            <span class="barber-rep-name"><i class="fa-solid fa-user-tag gold-text"></i> ${b.nombre}</span>
            <span class="barber-rep-value">$${b.monto_mes.toFixed(2)}</span>
        `;
        perfList.appendChild(item);
    });

    document.getElementById("total-generated-general").textContent = `$${totalGeneral.toFixed(2)}`;
}

// ---------------------------------------------
// 6. GENERACIÓN DE REPORTES EN PDF (jsPDF)
// ---------------------------------------------
function setupPdfListeners() {
    document.getElementById("btn-print-report").addEventListener("click", () => {
        generateEarningsReportPDF(false); // Open in new tab
    });
    
    document.getElementById("btn-reset-month").addEventListener("click", async () => {
        const confirmed = confirm(
            "⚠️ ATENCIÓN: Esta acción descargará el reporte en PDF y REINICIARÁ todos los contadores de ganancias a $0, " +
            "además de limpiar la agenda de citas para el nuevo mes. ¿Desea continuar?"
        );
        if (confirmed) {
            generateEarningsReportPDF(true); // Download directly
            
            // Call API reset
            const res = await api.resetMonth();
            if (res.success) {
                alert("Base de datos de Golden Razor limpiada correctamente (monto_mes = 0).");
                await loadAdminDashboardData();
                refreshPublicSchedule();
            }
        }
    });
}

// Generate report using jsPDF custom drawing for premium aesthetics
async function generateEarningsReportPDF(downloadDirectly = false) {
    const { jsPDF } = window.jspdf;
    
    // Page layout settings (Standard A4)
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    const barbers = await api.getBarberos();
    let totalGeneral = 0;
    barbers.forEach(b => totalGeneral += b.monto_mes);

    // Get current date/time
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeFormatted = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // --- DISEÑO AESTHETIC DEL PDF (NEGRO Y DORADO) ---
    
    // 1. Cabecera - Banda superior negra
    doc.setFillColor(14, 14, 14); // Charcoal Black
    doc.rect(0, 0, 210, 38, 'F');

    // 2. Línea dorada de separación en cabecera
    doc.setFillColor(212, 175, 55); // Metallic Gold
    doc.rect(0, 37, 210, 1.5, 'F');

    // 3. Logo - Draw Gold Circle border and add the actual logo image if available, else scissors vector
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.6);
    doc.circle(30, 19, 10);
    
    if (logoBase64) {
        // Embed the real Golden Razor logo circular layout
        try {
            doc.addImage(logoBase64, 'JPEG', 21, 10, 18, 18);
        } catch (e) {
            console.error("Error drawing base64 logo in PDF, drawing vector scissors fallback", e);
            drawScissorsFallback(doc);
        }
    } else {
        drawScissorsFallback(doc);
    }

    // 4. Textos de Identidad en Cabecera (Color Oro / Blanco)
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(212, 175, 55); // Gold text
    doc.text("GOLDEN RAZOR", 46, 18);
    
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(220, 220, 220); // Silver white
    doc.text("Detalles que valen oro", 46, 24);

    // 5. Metadatos del Reporte (Lado derecho de la cabecera)
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(212, 175, 55);
    doc.text("REPORTE DE INGRESOS", 135, 16);
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(170, 170, 170);
    doc.text(`Fecha: ${dateFormatted}`, 135, 22);
    doc.text(`Hora: ${timeFormatted}`, 135, 27);

    // 6. Título del Reporte en la Página
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text("BALANCE DE RENDIMIENTO MENSUAL", 20, 52);

    // 7. Línea divisoria de sección
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(20, 56, 190, 56);

    // 8. Tabla de Datos de Barberos
    // Cabecera de la tabla
    let currentY = 68;
    doc.setFillColor(14, 14, 14); // Fondo negro para cabecera tabla
    doc.rect(20, currentY, 170, 10, 'F');
    
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(212, 175, 55); // Letras doradas
    doc.text("BARBERO / ESTILISTA", 25, currentY + 6.5);
    doc.text("INGRESOS MENSUALES ACUMULADOS", 115, currentY + 6.5);

    // Filas de la tabla (6 Barberos)
    currentY += 10;
    doc.setFont("Helvetica", "normal");
    doc.setTextColor(50, 50, 50);

    barbers.forEach((barber, index) => {
        // Fondo alterno gris sutil
        if (index % 2 === 1) {
            doc.setFillColor(248, 248, 248);
            doc.rect(20, currentY, 170, 10, 'F');
        }
        
        // Bordes finos horizontales
        doc.setDrawColor(240, 240, 240);
        doc.line(20, currentY + 10, 190, currentY + 10);

        doc.text(barber.nombre, 25, currentY + 6.5);
        doc.text(`$${barber.monto_mes.toFixed(2)}`, 115, currentY + 6.5);
        
        currentY += 10;
    });

    // 9. Fila de Total General
    currentY += 5;
    doc.setFillColor(212, 175, 55); // Fondo dorado para el bloque del total
    doc.rect(20, currentY, 170, 12, 'F');

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0); // Texto negro para alto contraste sobre fondo dorado
    doc.text("TOTAL GENERAL GENERADO:", 25, currentY + 7.5);
    doc.text(`$${totalGeneral.toFixed(2)} USD`, 115, currentY + 7.5);

    // 10. Pie de Página - Firmas y Validez
    currentY += 35;
    doc.setDrawColor(180, 180, 180);
    doc.line(25, currentY, 85, currentY);
    doc.line(125, currentY, 185, currentY);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("Firma Gerente Barbería", 40, currentY + 5);
    doc.text("Firma Auditor de Caja", 143, currentY + 5);

    // Mensaje de pie
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(8);
    doc.text("Este balance es un documento fiscal de uso interno y representa las ganancias brutas acumuladas por barbero.", 20, 275);
    doc.text("Golden Razor Barbershop - Todos los derechos reservados © 2026.", 20, 280);

    // --- ACCIÓN DE SALIDA ---
    if (downloadDirectly) {
        doc.save(`Reporte_Mensual_Golden_Razor_${dateFormatted.replace(/\//g, '-')}.pdf`);
    } else {
        const string = doc.output('bloburl');
        window.open(string, '_blank');
    }
}

// Draw the vector scissors symbol inside the ring in case image isn't loaded
function drawScissorsFallback(doc) {
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.4);
    // Mango de tijeras
    doc.circle(26, 23, 2);
    doc.circle(34, 23, 2);
    // Hojas de tijeras cruzadas
    doc.line(27, 21, 33, 11);
    doc.line(33, 21, 27, 11);
}
