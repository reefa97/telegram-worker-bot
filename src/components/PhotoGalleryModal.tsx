import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, ChevronLeft, ChevronRight, Download, Image as ImageIcon, Clock } from 'lucide-react';

interface Photo {
    id: string;
    photo_url: string;
    photo_type: 'start' | 'end' | 'during';
    uploaded_at: string;
}

interface PhotoGalleryModalProps {
    sessionId: string;
    onClose: () => void;
}

export default function PhotoGalleryModal({ sessionId, onClose }: PhotoGalleryModalProps) {
    const [photos, setPhotos] = useState<Photo[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        loadPhotos();
        // Prevent scrolling when modal is open
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [sessionId]);

    const loadPhotos = async () => {
        const { data } = await supabase
            .from('shift_photos')
            .select('*')
            .eq('session_id', sessionId)
            .order('uploaded_at');

        if (data) setPhotos(data);
        setLoading(false);
    };

    const nextPhoto = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex((prev) => (prev + 1) % photos.length);
    };

    const prevPhoto = (e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') nextPhoto();
            if (e.key === 'ArrowLeft') prevPhoto();
            if (e.key === 'Escape') onClose();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [photos.length]);

    if (loading) return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-50">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-50 animate-fadeIn">
            <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all z-50"
            >
                <X className="w-8 h-8" />
            </button>

            {photos.length === 0 ? (
                <div className="text-white/50 text-center flex flex-col items-center">
                    <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-xl font-light">Нет фото для этой смены</p>
                </div>
            ) : (
                <div className="relative w-full h-full flex flex-col items-center justify-center p-4">
                    <div className="flex-1 w-full flex items-center justify-center relative max-h-[85vh]">
                        <img
                            src={photos[currentIndex].photo_url}
                            alt={`Photo ${currentIndex + 1}`}
                            className="max-h-full max-w-full object-contain rounded-lg shadow-2xl animate-scaleIn"
                        />

                        {photos.length > 1 && (
                            <>
                                <button
                                    onClick={prevPhoto}
                                    className="absolute left-2 md:left-8 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-sm transition-all hover:scale-110"
                                >
                                    <ChevronLeft className="w-8 h-8" />
                                </button>
                                <button
                                    onClick={nextPhoto}
                                    className="absolute right-2 md:right-8 p-3 bg-black/50 hover:bg-black/70 rounded-full text-white backdrop-blur-sm transition-all hover:scale-110"
                                >
                                    <ChevronRight className="w-8 h-8" />
                                </button>
                            </>
                        )}
                    </div>

                    <div className="mt-6 flex flex-col md:flex-row items-center gap-4 md:gap-8 text-white w-full max-w-4xl justify-center bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/10">
                        <div className="flex items-center gap-3">
                            <span className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider ${photos[currentIndex].photo_type === 'start' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                photos[currentIndex].photo_type === 'end' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                    'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                }`}>
                                {photos[currentIndex].photo_type === 'start' ? 'Начало смены' :
                                    photos[currentIndex].photo_type === 'end' ? 'Конец смены' : 'В процессе'}
                            </span>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-gray-300">
                            <div className="flex items-center gap-2">
                                <span className="font-mono text-white">{currentIndex + 1}</span>
                                <span className="text-gray-500">of</span>
                                <span className="font-mono text-white">{photos.length}</span>
                            </div>

                            <div className="w-px h-4 bg-gray-700 hidden md:block"></div>

                            <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-gray-400" />
                                {new Date(photos[currentIndex].uploaded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>

                            <a
                                href={photos[currentIndex].photo_url}
                                download
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 hover:bg-white/10 rounded-full text-gray-300 hover:text-white transition-colors"
                                title="Скачать"
                            >
                                <Download className="w-5 h-5" />
                            </a>
                        </div>
                    </div>

                    {/* Thumbnails Preview */}
                    {photos.length > 1 && (
                        <div className="absolute bottom-24 flex gap-2 overflow-x-auto max-w-full px-4 pb-2 hide-scrollbar opacity-0 hover:opacity-100 transition-opacity duration-300">
                            {photos.map((photo, idx) => (
                                <button
                                    key={photo.id}
                                    onClick={() => setCurrentIndex(idx)}
                                    className={`relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${idx === currentIndex ? 'border-primary-500 scale-110 z-10' : 'border-transparent opacity-50 hover:opacity-100'
                                        }`}
                                >
                                    <img src={photo.photo_url} className="w-full h-full object-cover" alt="" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
