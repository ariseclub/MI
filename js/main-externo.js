const MAP_EL = 'map';
const DATA_FILE = 'data/places-externo.json';
const CATEGORIES_FILE = 'data/categories-externo.json';

let map;
let markers = [];
let placesData = null;
let categoriesConfig = null;
let centerMarker = null;
let sidebarVisible = true;

async function loadData() {
    const res = await fetch(DATA_FILE);
    return res.json();
}

async function loadCategories() {
    const res = await fetch(CATEGORIES_FILE);
    return res.json();
}

function initMap(center) {
    const latlng = (center.coordinates && Array.isArray(center.coordinates) && center.coordinates.length >= 2)
        ? [center.coordinates[0], center.coordinates[1]]
        : [center.lat, center.lng];

    map = L.map(MAP_EL).setView(latlng, center.zoom || 15);
    L.tileLayer('https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}{r}.{ext}', {
        maxZoom: 20,
        minZoom: 14,
        ext: 'png',
        attribution: '&copy; OpenStreetMap contributors &copy; Stadia Maps'
    }).addTo(map);

    const centerColor = (categoriesConfig && categoriesConfig.defaultColor) || '#6c5ce7';
    centerMarker = L.marker(latlng, {
        icon: createPinIcon(centerColor, true)
    }).addTo(map);
    centerMarker.bindPopup(`
        <strong>${center.name}</strong><br>
        ${center.description || ''}
    `);

    const MenuControl = L.Control.extend({
        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
            
            const menuLink = L.DomUtil.create('a', '', container);
            menuLink.href = '#';
            menuLink.title = 'Mostrar/ocultar menú';
            menuLink.innerHTML = '&#9776;';

            const switchLink = L.DomUtil.create('a', '', container);
            switchLink.href = '#';
            switchLink.title = 'Cambiar a mapa interno';
            switchLink.innerHTML = '&#8635;';

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(menuLink, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                toggleSidebar();
            });
            L.DomEvent.on(switchLink, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                window.location.href = 'indexi.html';
            });

            return container;
        }
    });

    map.addControl(new MenuControl({ position: 'topleft' }));
}

function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
    document.body.classList.toggle('sidebar-collapsed', !sidebarVisible);
}

function getLatLng(place) {
    if (place.coordinates && Array.isArray(place.coordinates) && place.coordinates.length >= 2) {
        return [place.coordinates[0], place.coordinates[1]];
    }
    if (place.lat !== undefined && place.lng !== undefined) {
        return [place.lat, place.lng];
    }
    if (typeof place.googleUrl === 'string') {
        let m = place.googleUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        if (!m) {
            m = place.googleUrl.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
        }
        if (m) {
            const lat = parseFloat(m[1]);
            const lng = parseFloat(m[2]);
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                return [lat, lng];
            }
        }
    }
    return null;
}

function buildDirectionsUrl(place, latlngOverride) {
    const latlng = latlngOverride || getLatLng(place);
    if (latlng) {
        const [lat, lng] = latlng;
        return `https://www.google.com/maps/dir/?api=1&origin=Current+Location&destination=${lat},${lng}`;
    }
    if (place.googleUrl) {
        return place.googleUrl;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || '')}`;
}

function getCategoryColor(category) {
    if (!categoriesConfig) {
        return '#6c5ce7';
    }
    const name = category || 'Otros';
    const match = (categoriesConfig.categories || []).find(c => c.name === name);
    return match ? match.color : (categoriesConfig.defaultColor || '#6c5ce7');
}

function createPinIcon(color, isCenter = false) {
    const border = isCenter ? '#ffffff' : 'rgba(0,0,0,0.65)';
    const size = isCenter ? 30 : 26;
    const html = `
    <div class="marker-pin" style="background:${color};border-color:${border};width:${size}px;height:${size}px;">
      <div class="marker-inner"></div>
    </div>
  `;
    return L.divIcon({
        className: 'custom-pin-icon',
        html,
        iconSize: [size, size + 6],
        iconAnchor: [size / 2, size + 2],
        popupAnchor: [0, -size / 2]
    });
}

function createMarker(place) {
    const latlng = getLatLng(place);
    if (!latlng) return null;
    const color = getCategoryColor(place.category);
    const marker = L.marker(latlng, { icon: createPinIcon(color) }).addTo(map);
    const directionsUrl = buildDirectionsUrl(place, latlng);
    marker.bindPopup(
        `<strong>${place.name}</strong><br>${place.description || ''}<br>` +
        `<a href="${directionsUrl}" target="_blank" rel="noopener noreferrer">¿Como llegar?</a>`
    );
    marker.placeName = place.name;
    return marker;
}

function clearMarkers() {
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
}

function renderPlacesList(filtered) {
    const ul = document.getElementById('places-list');
    ul.innerHTML = '';
    filtered.forEach(p => {
        const li = document.createElement('li');
        li.dataset.name = p.name;
        const directionsUrl = buildDirectionsUrl(p);
        li.innerHTML = `
      <div class="place-title">${p.name}</div>
      <div class="place-desc">${p.category || ''} • ${p.description || ''}</div>
      <a class="go-link" href="${directionsUrl}" target="_blank" rel="noopener noreferrer">¿Como llegar?</a>
    `;
        li.onclick = () => {
            const found = markers.find(m => m.marker.placeName === p.name);
            if (found) {
                map.setView(found.marker.getLatLng(), 18, { animate: true });
                found.marker.openPopup();
            }
        };
        ul.appendChild(li);
    });
}

function renderMarkers(filtered) {
    clearMarkers();
    filtered.forEach(p => {
        const m = createMarker(p);
        if (m) markers.push({ name: p.name, marker: m });
    });
}

function buildCategoryChips(places) {
    const container = document.getElementById('filters');
    const cats = Array.from(new Set(places.map(p => p.category || 'Otros')));
    cats.unshift('Todos');
    container.innerHTML = '';
    cats.forEach(cat => {
        const chip = document.createElement('div');
        chip.className = 'chip' + (cat === 'Todos' ? ' active' : '');
        chip.innerText = cat;
        chip.onclick = () => {
            Array.from(container.children).forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            applyFilters();
        };
        container.appendChild(chip);
    });
}

function getActiveCategory() {
    const chips = document.querySelectorAll('#filters .chip');
    for (const c of chips) if (c.classList.contains('active')) return c.innerText;
    return 'Todos';
}

function applyFilters() {
    const q = document.getElementById('search').value.trim().toLowerCase();
    const activeCat = getActiveCategory();
    const filtered = placesData.places.filter(p => {
        const name = (p.name || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        const matchQ = name.includes(q) || desc.includes(q) || cat.includes(q);
        const matchCat = activeCat === 'Todos' ? true : (p.category === activeCat);
        return matchQ && matchCat;
    });
    renderMarkers(filtered);
    renderPlacesList(filtered);
}

async function main() {
    [placesData, categoriesConfig] = await Promise.all([
        loadData(),
        loadCategories()
    ]);
    initMap(placesData.center);
    buildCategoryChips(placesData.places);
    applyFilters();

    document.getElementById('search').addEventListener('input', () => applyFilters());
}

window.addEventListener('load', main);

