import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation, MapPin } from 'lucide-react';

// Fix for default marker icons in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface ObjectsMapProps {
    objects: any[];
}

function LocationControl({ userLocation }: { userLocation: [number, number] | null }) {
    const map = useMap();

    const goToLocation = () => {
        if (userLocation) {
            map.flyTo(userLocation, 14);
        } else {
            // If location is unknown, try to request it again
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    map.flyTo([latitude, longitude], 14);
                },
                () => alert('Не удалось определить местоположение'),
                { enableHighAccuracy: true }
            );
        }
    };

    return (
        <div className="leaflet-bottom leaflet-right">
            <div className="leaflet-control leaflet-bar">
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        goToLocation();
                    }}
                    className="bg-white hover:bg-gray-50 flex items-center justify-center w-8 h-8 cursor-pointer border-none"
                    title="Мое местоположение"
                    style={{ width: '34px', height: '34px' }} // Match leaflet default control size roughly
                >
                    <Navigation
                        size={18}
                        className={userLocation ? "text-blue-600 fill-blue-100" : "text-gray-600"}
                    />
                </button>
            </div>
        </div>
    );
}


export default function ObjectsMap({ objects }: ObjectsMapProps) {
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    // Krakow coordinates as default
    const [center] = useState<[number, number]>([50.0647, 19.9450]);

    useEffect(() => {
        // Get user location on mount
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setUserLocation([latitude, longitude]);
                },
                (error) => {
                    console.error("Error getting location:", error);
                },
                { enableHighAccuracy: true }
            );
        }
    }, []);

    // Function to calculate distance (Haversine formula) in km
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371; // Radius of the earth in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const d = R * c; // Distance in km
        return d.toFixed(2);
    };

    return (
        <div className="h-[600px] w-full rounded-xl overflow-hidden shadow-sm border border-zinc-200 dark:border-zinc-800 relative z-0">
            <MapContainer
                center={center}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                className="z-0"
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />

                <LocationControl userLocation={userLocation} />

                {/* User Location Marker */}
                {userLocation && (
                    <Marker position={userLocation} icon={new L.Icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34],
                        shadowSize: [41, 41]
                    })}>
                        <Popup>
                            <div className="font-semibold text-center">
                                Вы здесь <br />
                                <span className="text-xs font-normal text-gray-500">
                                    Ваше местоположение
                                </span>
                            </div>
                        </Popup>
                    </Marker>
                )}

                {/* Object Markers */}
                {objects.map((obj) => (
                    (obj.latitude && obj.longitude) ? (
                        <Marker
                            key={obj.id}
                            position={[obj.latitude, obj.longitude]}
                        >
                            <Popup>
                                <div className="p-1 min-w-[200px]">
                                    <h3 className="font-bold text-sm mb-1 text-gray-900">{obj.name}</h3>
                                    <div className="flex items-start gap-1 mb-2">
                                        <MapPin size={12} className="mt-0.5 text-gray-400" />
                                        <span className="text-xs text-gray-500">{obj.address}</span>
                                    </div>

                                    {userLocation && (
                                        <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md mb-2 w-fit">
                                            <Navigation size={12} />
                                            <span>
                                                {calculateDistance(
                                                    userLocation[0], userLocation[1],
                                                    obj.latitude, obj.longitude
                                                )} км от вас
                                            </span>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 gap-1 text-[11px] text-gray-600 border-t pt-2 mt-1">
                                        {(obj.hourly_rate > 0) && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Ставка:</span>
                                                <span className="font-medium">{obj.hourly_rate} zł/ч</span>
                                            </div>
                                        )}
                                        {(obj.monthly_rate > 0) && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">Ставка:</span>
                                                <span className="font-medium">{obj.monthly_rate} zł/мес</span>
                                            </div>
                                        )}
                                        {obj.schedule_time_start && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-400">График:</span>
                                                <span className="font-medium">
                                                    {obj.schedule_time_start} - {obj.schedule_time_end}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    ) : null
                ))}
            </MapContainer>
        </div>
    );
}
