// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCGoAlwFJ4XKTfvXFZkBsvnNjSH0gY0q8k",
    authDomain: "ntmg-4836f.firebaseapp.com",
    databaseURL: "https://ntmg-4836f-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "ntmg-4836f",
    storageBucket: "ntmg-4836f.firebasestorage.app",
    messagingSenderId: "193257484938",
    appId: "1:193257484938:web:62c585da7585bbef61b373"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// DOM elements
const colorPicker = document.getElementById('color-picker');
const alertBox = document.getElementById('alert');
const drawControls = document.getElementById('draw-controls');
const confirmBtn = document.getElementById('confirm-btn');
const cancelBtn = document.getElementById('cancel-btn');
const clearPreviewBtn = document.getElementById('clear-preview-btn');
const gridToggle = document.getElementById('grid-toggle');

// Pixel settings
const PIXEL_SIZE = 5; // Kích thước pixel tính bằng pixel trên màn hình
const GRID_CELL_SIZE = 0.0005; // Giảm 20 lần so với trước (0.01 / 20)
const MAX_ZOOM = 22; // Tăng zoom tối đa để có thể phóng to chi tiết
const MIN_ZOOM = 2;
const GRID_MIN_ZOOM = 5; // Zoom tối thiểu để hiển thị lưới

// Create map
const map = new maplibregl.Map({
    container: 'map',
    style: {
        version: 8,
        sources: {
            'raster-tiles': {
                type: 'raster',
                tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '© OpenStreetMap contributors'
            }
        },
        layers: [{
            id: 'simple-tiles',
            type: 'raster',
            source: 'raster-tiles',
            minzoom: 0,
            maxzoom: 19
        }]
    },
    center: [105.8, 16.0],
    zoom: 5,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    maxBounds: [85, -10, 125, 25]
});

// Store all pixels and preview
let pixels = [];
let previewPixels = [];
let tempPreviewPixels = [];
let lastClickTime = 0;
let isGridVisible = false;
let isDrawing = false;

// Tạo dữ liệu lưới GeoJSON
function generateGridData() {
    const features = [];
    const bounds = map.getBounds();
    
    // Tính toán phạm vi lưới dựa trên bounds hiện tại
    const minLng = Math.floor(bounds.getWest() / GRID_CELL_SIZE) * GRID_CELL_SIZE;
    const maxLng = Math.ceil(bounds.getEast() / GRID_CELL_SIZE) * GRID_CELL_SIZE;
    const minLat = Math.floor(bounds.getSouth() / GRID_CELL_SIZE) * GRID_CELL_SIZE;
    const maxLat = Math.ceil(bounds.getNorth() / GRID_CELL_SIZE) * GRID_CELL_SIZE;
    
    // Tạo các đường lưới dọc
    for (let lng = minLng; lng <= maxLng; lng += GRID_CELL_SIZE) {
        features.push({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [lng, minLat],
                    [lng, maxLat]
                ]
            },
            properties: {}
        });
    }
    
    // Tạo các đường lưới ngang
    for (let lat = minLat; lat <= maxLat; lat += GRID_CELL_SIZE) {
        features.push({
            type: 'Feature',
            geometry: {
                type: 'LineString',
                coordinates: [
                    [minLng, lat],
                    [maxLng, lat]
                ]
            },
            properties: {}
        });
    }
    
    return {
        type: 'FeatureCollection',
        features: features
    };
}

// Làm tròn tọa độ về ô lưới gần nhất
function snapToGrid(lng, lat) {
    const gridLng = Math.round(lng / GRID_CELL_SIZE) * GRID_CELL_SIZE;
    const gridLat = Math.round(lat / GRID_CELL_SIZE) * GRID_CELL_SIZE;
    return [gridLng, gridLat];
}

// Tạo hình vuông cho pixel
function createSquareFeature(lng, lat, color) {
    const halfSize = GRID_CELL_SIZE / 2;
    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [lng - halfSize, lat - halfSize],
                [lng + halfSize, lat - halfSize],
                [lng + halfSize, lat + halfSize],
                [lng - halfSize, lat + halfSize],
                [lng - halfSize, lat - halfSize]
            ]]
        },
        properties: {
            color: color
        }
    };
}

// Custom layer for pixels
map.on('load', () => {
    // Add pixel source
    map.addSource('pixels', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });
    
    // Add preview source (cho di chuột)
    map.addSource('hover-preview', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });
    
    // Add temp preview source (cho các điểm đã click trong chế độ xem trước)
    map.addSource('temp-preview', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });
    
    // Add grid source
    map.addSource('grid', {
        type: 'geojson',
        data: generateGridData()
    });

    // Add pixel layer
    map.addLayer({
        id: 'pixels',
        type: 'fill',
        source: 'pixels',
        paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 1,
            'fill-outline-color': 'rgba(0,0,0,0.1)'
        }
    });
    
    // Add temp preview pixel layer (đã click trong chế độ xem trước)
    map.addLayer({
        id: 'temp-preview-layer',
        type: 'fill',
        source: 'temp-preview',
        paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.7,
            'fill-outline-color': 'rgba(0,0,0,0.3)'
        }
    });
    
    // Add hover preview layer (theo chuột)
    map.addLayer({
        id: 'hover-preview-layer',
        type: 'fill',
        source: 'hover-preview',
        paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': 0.5,
            'fill-outline-color': 'rgba(0,0,0,0.5)'
        }
    });
    
    // Add grid layer
    map.addLayer({
        id: 'grid',
        type: 'line',
        source: 'grid',
        paint: {
            'line-color': 'rgba(0,0,0,0.3)',
            'line-width': 0.5,
            'line-dasharray': [2, 2]
        },
        minzoom: GRID_MIN_ZOOM
    });
    
    // Ẩn lưới ban đầu
    map.setLayoutProperty('grid', 'visibility', 'none');

    // Load pixels from Firebase
    database.ref('pixels').on('value', (snapshot) => {
        const features = [];
        snapshot.forEach((childSnapshot) => {
            const pixel = childSnapshot.val();
            features.push(createSquareFeature(pixel.lng, pixel.lat, pixel.color));
        });
        
        map.getSource('pixels').setData({
            type: 'FeatureCollection',
            features: features
        });
    });

    // Handle map click - thêm vào chế độ xem trước
    map.on('click', (e) => {
        if (!isDrawing) {
            // Bắt đầu chế độ vẽ
            isDrawing = true;
            drawControls.style.display = 'block';
            return;
        }
        
        // Thêm pixel vào temp preview
        const [lng, lat] = snapToGrid(e.lngLat.lng, e.lngLat.lat);
        const previewFeature = createSquareFeature(lng, lat, colorPicker.value);
        tempPreviewPixels.push(previewFeature);
        
        // Cập nhật temp preview layer
        map.getSource('temp-preview').setData({
            type: 'FeatureCollection',
            features: tempPreviewPixels
        });
    });
    
    // Handle map move - cập nhật hover preview
    map.on('mousemove', (e) => {
        if (!isDrawing) return;
        
        const [lng, lat] = snapToGrid(e.lngLat.lng, e.lngLat.lat);
        const previewFeature = createSquareFeature(lng, lat, colorPicker.value);
        
        map.getSource('hover-preview').setData({
            type: 'FeatureCollection',
            features: [previewFeature]
        });
    });
    
    // Cập nhật lưới khi zoom hoặc di chuyển map
    map.on('moveend', () => {
        if (isGridVisible) {
            map.getSource('grid').setData(generateGridData());
        }
    });

    // Xác nhận vẽ
    confirmBtn.addEventListener('click', confirmDrawing);
    
    // Xóa hết xem trước
    clearPreviewBtn.addEventListener('click', clearTempPreview);
    
    // Hủy vẽ
    cancelBtn.addEventListener('click', resetDrawing);
    
    // Bật/tắt lưới
    gridToggle.addEventListener('click', () => {
        isGridVisible = !isGridVisible;
        map.setLayoutProperty(
            'grid', 
            'visibility', 
            isGridVisible ? 'visible' : 'none'
        );
    });

    // Thêm phím tắt
    document.addEventListener('keydown', (e) => {
        if (!isDrawing) return;
        
        switch(e.key) {
            case 'Enter':
                confirmDrawing();
                break;
            case 'Escape':
                resetDrawing();
                break;
            case 'Delete':
                clearTempPreview();
                break;
        }
    });

    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl());
});

// Xác nhận vẽ các điểm đã chọn
function confirmDrawing() {
    const now = Date.now();
    if (now - lastClickTime < 1000) {
        alertBox.style.display = 'block';
        setTimeout(() => {
            alertBox.style.display = 'none';
        }, 2000);
        return;
    }
    lastClickTime = now;
    
    if (tempPreviewPixels.length === 0) return;
    
    // Lưu tất cả các điểm trong temp preview vào Firebase
    const batchUpdates = {};
    tempPreviewPixels.forEach((feature, index) => {
        const coords = feature.geometry.coordinates[0][0];
        const lng = coords[0] + GRID_CELL_SIZE/2;
        const lat = coords[1] + GRID_CELL_SIZE/2;
        
        const newPixel = {
            lng: lng,
            lat: lat,
            color: feature.properties.color,
            timestamp: Date.now() + index // Đảm bảo mỗi pixel có timestamp khác nhau
        };
        
        batchUpdates[`pixels/${Date.now()}_${index}`] = newPixel;
    });
    
    // Lưu hàng loạt vào Firebase
    database.ref().update(batchUpdates);
    
    // Reset trạng thái vẽ
    resetDrawing();
}

// Xóa các điểm xem trước tạm thời
function clearTempPreview() {
    tempPreviewPixels = [];
    map.getSource('temp-preview').setData({
        type: 'FeatureCollection',
        features: []
    });
}

// Reset trạng thái vẽ
function resetDrawing() {
    isDrawing = false;
    drawControls.style.display = 'none';
    clearTempPreview();
    map.getSource('hover-preview').setData({
        type: 'FeatureCollection',
        features: []
    });
}