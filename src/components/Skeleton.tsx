import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', style }) => {
  return (
    <div
      className={`animate-pulse bg-slate-200/80 rounded-lg ${className}`}
      style={style}
    />
  );
};

export const SkeletonFilterBar: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const SkeletonMetricCards: React.FC = () => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-7 w-7 rounded-full" />
          </div>
          <Skeleton className="h-8 w-14 rounded-lg my-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
};

export const SkeletonChart: React.FC = () => {
  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm mb-6 flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="h-64 flex items-end gap-3 pt-6 px-4">
        {[40, 65, 85, 30, 95, 55, 75, 50, 80, 60].map((h, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <Skeleton className="w-full rounded-t-lg" style={{ height: `${h}%` }} />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const SkeletonTable: React.FC<{ rows?: number }> = ({ rows = 6 }) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden mb-6">
      <div className="p-4 border-b border-slate-200/80 flex justify-between items-center bg-slate-50/60">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex flex-col gap-1.5 flex-1 max-w-sm">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-7 w-20 rounded-full shrink-0" />
            <Skeleton className="h-4 w-16 shrink-0 hidden sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const SkeletonDashboard: React.FC = () => {
  return (
    <div className="w-full animate-fadeIn">
      <SkeletonFilterBar />
      <SkeletonMetricCards />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SkeletonChart />
        <SkeletonChart />
      </div>
      <SkeletonTable rows={5} />
    </div>
  );
};

export const SkeletonLaporan: React.FC = () => {
  return (
    <div className="w-full animate-fadeIn">
      <SkeletonFilterBar />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-2">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-7 w-12 rounded-lg" />
          </div>
        ))}
      </div>
      <SkeletonTable rows={8} />
    </div>
  );
};
