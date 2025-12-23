import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';

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

    const nextPhoto = () => {
        setCurrentIndex((prev) => (prev + 1) % photos.length);
    };

    const prevPhoto = () => {
        setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    };

    if (loading) return null;

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
            <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white hover:text-gray-300 p-2"
            >
                <X className="w-8 h-8" />
            </button>

            {photos.length === 0 ? (
                <div className="text-white text-center">
                    <p className="text-xl">Нет фото для этой смены</p>
                </div>
            ) : (
                <div className="relative w-full max-w-4xl h-[80vh] flex flex-col items-center">
                    <div className="flex-1 w-full flex items-center justify-center relative">
                        <img
                            src={photos[currentIndex].photo_url}
                            alt={`Photo ${currentIndex + 1}`}
                            className="max-h-full max-w-full object-contain"
                        />

                        {photos.length > 1 && (
                            <>
                                <button
                                    onClick={prevPhoto}
                                    className="absolute left-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
                                >
                                    <ChevronLeft className="w-8 h-8" />
                                </button>
                                <button
                                    onClick={nextPhoto}
                                    className="absolute right-4 p-2 bg-black/50 rounded-full text-white hover:bg-black/70"
                                >
                                    <ChevronRight className="w-8 h-8" />
                                </button>
                            </>
                        )}
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-white">
                        <span className="bg-gray-700 px-3 py-1 rounded-full text-sm">
                            {photos[currentIndex].photo_type === 'start' ? 'Начало смены' :
                                photos[currentIndex].photo_type === 'end' ? 'Конец смены' : 'В процессе'}
                        </span>
                        <span>
                            {currentIndex + 1} / {photos.length}
                        </span>
                        <a
                            href={photos[currentIndex].photo_url}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-gray-800 rounded-full"
                        >
                            <Download className="w-5 h-5" />
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
}
