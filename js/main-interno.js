const MAP_EL = 'map';
const DATA_FILE = 'data/places-interno.json';
const CATEGORIES_FILE = 'data/categories-interno.json';

let map;
let markers = [];
let placesData = null;
let categoriesConfig = null;
let sidebarVisible = true;
let currentFloorId = null;
let floorOverlay = null;
let imageBounds = null;
let floorControlContainer = null;
let baseZoom = 0;

async function loadData() {
    const res = await fetch(DATA_FILE);
    return res.json();
}

async function loadCategories() {
    const res = await fetch(CATEGORIES_FILE);
    return res.json();
}

function buildImageBounds(imageSize) {
    const h = imageSize.height;
    const w = imageSize.width;
    return [[0, 0], [h, w]];
}

function getLatLngFromPlace(place) {
    if (place.coordinates && Array.isArray(place.coordinates) && place.coordinates.length >= 2) {
        const x = place.coordinates[0];
        const y = place.coordinates[1];
        // Invertir Y: en CRS.Simple, Y aumenta hacia arriba, pero en imagen Y aumenta hacia abajo
        const imgHeight = imageBounds ? imageBounds[1][0] : y;
        return [imgHeight - y, x];
    }
    return null;
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

function initMap(center, imageSize) {
    imageBounds = buildImageBounds(imageSize);

    const initialLatLng = getLatLngFromPlace(center) || [imageSize.height / 2, imageSize.width / 2];

    baseZoom = (typeof center.zoom === 'number' ? center.zoom : 0);

    map = L.map(MAP_EL, {
        crs: L.CRS.Simple,
        minZoom: baseZoom - 2,
        maxZoom: baseZoom + 2,
        zoomSnap: 0.25
    }).setView(initialLatLng, baseZoom);

    // control para mostrar/ocultar el menú lateral y cambiar de mapa
    const MenuControl = L.Control.extend({
        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
            
            const menuLink = L.DomUtil.create('a', '', container);
            menuLink.href = '#';
            menuLink.title = 'Mostrar/ocultar menú';
            menuLink.innerHTML = '&#9776;';

            const switchLink = L.DomUtil.create('a', '', container);
            switchLink.href = '#';
            switchLink.title = 'Cambiar a mapa externo';
            switchLink.innerHTML = '&#8635;';

            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(menuLink, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                toggleSidebar();
            });
            L.DomEvent.on(switchLink, 'click', function (e) {
                L.DomEvent.preventDefault(e);
                window.location.href = 'index.html';
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

function clearMarkers() {
    markers.forEach(m => map.removeLayer(m.marker));
    markers = [];
}

function createMarker(place) {
    const latlng = getLatLngFromPlace(place);
    if (!latlng) return null;
    const color = getCategoryColor(place.category);
    const marker = L.marker(latlng, { icon: createPinIcon(color) }).addTo(map);
    marker.bindPopup(
        `<strong>${place.name}</strong><br>${place.description || ''}`
    );
    marker.placeName = place.name;
    return marker;
}

function renderMarkers(filtered) {
    clearMarkers();
    filtered.forEach(p => {
        const m = createMarker(p);
        if (m) markers.push({ name: p.name, marker: m });
    });
}

function renderPlacesList(filtered) {
    const ul = document.getElementById('places-list');
    ul.innerHTML = '';
    filtered.forEach(p => {
        const li = document.createElement('li');
        li.dataset.name = p.name;
        li.innerHTML = `
      <div class="place-title">${p.name}</div>
      <div class="place-desc">${p.category || ''} • ${p.description || ''}</div>
    `;
        li.onclick = () => {
            if (p.floor && p.floor !== currentFloorId) {
                switchFloor(p.floor);
            }

            setTimeout(() => {
                const found = markers.find(m => m.marker.placeName === p.name);
                if (found) {
                    map.setView(found.marker.getLatLng(), 0, { animate: true });
                    found.marker.openPopup();
                }
            }, 300);
        };
        ul.appendChild(li);
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
    if (!placesData) return;
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
    const markersForCurrentFloor = filtered.filter(p => p.floor === currentFloorId);
    renderMarkers(markersForCurrentFloor);
    renderPlacesList(filtered);
}
function updateFloorButtonsActive() {
    if (!floorControlContainer) return;
    Array.from(floorControlContainer.children).forEach(btn => {
        btn.classList.toggle('active-floor', btn.dataset.floorId === currentFloorId);
    });
}

function getFloorById(id) {
    return (placesData.floors || []).find(f => f.id === id) || null;
}

function switchFloor(floorId) {
    if (!placesData) return;
    const floor = getFloorById(floorId);
    if (!floor) return;

    currentFloorId = floorId;
    updateFloorButtonsActive();

    if (floorOverlay) {
        map.removeLayer(floorOverlay);
    }
    floorOverlay = L.imageOverlay(floor.image, imageBounds).addTo(map);

    let targetCenter = null;
    if (placesData.center && placesData.center.floor === floorId) {
        targetCenter = getLatLngFromPlace(placesData.center);
    }
    if (!targetCenter) {
        targetCenter = [placesData.imageSize.height / 2, placesData.imageSize.width / 2];
    }
    map.setView(targetCenter, baseZoom, { animate: true });

    applyFilters();
}

async function main() {
    [placesData, categoriesConfig] = await Promise.all([
        loadData(),
        loadCategories()
    ]);

    if (!placesData || !placesData.imageSize || !placesData.floors || placesData.floors.length === 0) {
        console.error('places.json no tiene la estructura esperada para el mapa interno');
        return;
    }

    currentFloorId = (placesData.center && placesData.center.floor) || placesData.floors[0].id;

    initMap(placesData.center || {}, placesData.imageSize);

    const FloorControl = L.Control.extend({
        onAdd: function () {
            const container = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
            floorControlContainer = container;
            (placesData.floors || []).forEach((floor, index) => {
                const link = L.DomUtil.create('a', '', container);
                link.href = '#';
                link.title = floor.name || `Planta ${index}`;
                link.innerHTML = `P${index}`;
                link.dataset.floorId = floor.id;
                if (floor.id === currentFloorId) {
                    link.classList.add('active-floor');
                }

                L.DomEvent.disableClickPropagation(link);
                L.DomEvent.on(link, 'click', function (e) {
                    L.DomEvent.preventDefault(e);
                    switchFloor(floor.id);
                });
            });
            return container;
        }
    });

    map.addControl(new FloorControl({ position: 'topleft' }));
    buildCategoryChips(placesData.places);

    switchFloor(currentFloorId);

    document.getElementById('search').addEventListener('input', () => applyFilters());
}

window.addEventListener('load', main);

