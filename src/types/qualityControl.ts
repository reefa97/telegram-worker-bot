// ========================================
// Quality Control Module — TypeScript Types
// ========================================

export interface QualityCheckSchedule {
    id: string;
    object_id: string;
    day_of_week: number;       // 1-7 (1=Mon, 7=Sun)
    frequency_weeks: 1 | 2 | 3 | 4;
    last_check_date: string | null; // ISO date
    manager_id: string;
    created_at: string;
    // Joined fields
    object_name?: string;
    manager_name?: string;
}

export interface QualityCheck {
    id: string;
    object_id: string;
    manager_id: string;
    check_date: string;        // ISO timestamp
    score_percentage: number;  // 0-100
    notes: string | null;
    created_at: string;
    // Joined fields
    object_name?: string;
    manager_name?: string;
    items?: QualityCheckItem[];
}

export interface QualityCheckItem {
    id: string;
    check_id: string;
    task_name: string;
    is_passed: boolean;
    photo_urls: string[];
}

export interface WorkerPointsLog {
    id: string;
    worker_id: string;
    check_id: string | null;
    points_change: number;     // positive = earned, negative = deducted
    reason: string | null;
    created_at: string;
    // Joined fields
    worker_name?: string;
    object_name?: string;
}

// Form types for creating new checks
export interface QualityCheckFormData {
    object_id: string;
    score_percentage: number;
    notes: string;
    items: { task_name: string; is_passed: boolean }[];
}

export interface QualityCheckScheduleFormData {
    object_id: string;
    day_of_week: number;
    frequency_weeks: 1 | 2 | 3 | 4;
    manager_id: string;
}
