interface CompetitorIllustrationProps {
  className?: string;
}

export function CompetitorIllustration({ className = "w-32 h-32" }: CompetitorIllustrationProps) {
  return (
    <div className={`${className} mx-auto`}>
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Background circles */}
        <circle
          cx="100"
          cy="100"
          r="95"
          fill="currentColor"
          className="text-muted/20"
        />
        <circle
          cx="100"
          cy="100"
          r="75"
          fill="currentColor"
          className="text-background"
        />
        
        {/* Competitor icons (people) */}
        <g className="text-muted-foreground" fill="currentColor">
          {/* Person 1 */}
          <circle cx="75" cy="80" r="8" />
          <path d="M75 95 C75 95, 65 95, 65 105 L65 120 L85 120 L85 105 C85 95, 75 95, 75 95 Z" />
          
          {/* Person 2 */}
          <circle cx="125" cy="80" r="8" />
          <path d="M125 95 C125 95, 115 95, 115 105 L115 120 L135 120 L135 105 C135 95, 125 95, 125 95 Z" />
          
          {/* Person 3 (your brand - highlighted) */}
          <circle cx="100" cy="120" r="10" className="text-primary" fill="currentColor" />
          <path d="M100 135 C100 135, 88 135, 88 147 L88 165 L112 165 L112 147 C112 135, 100 135, 100 135 Z" className="text-primary" fill="currentColor" />
        </g>
        
        {/* Comparison arrows */}
        <g className="text-muted-foreground" stroke="currentColor" strokeWidth="2" fill="none">
          <path d="M85 85 L95 105" strokeDasharray="3,3" />
          <path d="M115 85 L105 105" strokeDasharray="3,3" />
        </g>
        
        {/* Chart elements */}
        <g className="text-muted-foreground/60" fill="currentColor">
          <rect x="50" y="40" width="4" height="15" />
          <rect x="60" y="35" width="4" height="20" />
          <rect x="70" y="30" width="4" height="25" />
          <rect x="130" y="45" width="4" height="10" />
          <rect x="140" y="40" width="4" height="15" />
          <rect x="150" y="35" width="4" height="20" />
        </g>
        
        {/* Plus icon for adding competitors */}
        <g className="text-primary/60">
          <circle cx="170" cy="50" r="15" fill="currentColor" className="text-primary/10" />
          <path d="M170 40 L170 60 M160 50 L180 50" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

export function EmptyAnalyticsIllustration({ className = "w-32 h-32" }: CompetitorIllustrationProps) {
  return (
    <div className={`${className} mx-auto`}>
      <svg
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Chart background */}
        <rect
          x="30"
          y="40"
          width="140"
          height="120"
          rx="8"
          fill="currentColor"
          className="text-muted/10"
          stroke="currentColor"
          strokeWidth="1"
        />
        
        {/* Empty chart bars */}
        <g className="text-muted-foreground/30" fill="currentColor">
          <rect x="50" y="130" width="15" height="20" rx="2" />
          <rect x="75" y="120" width="15" height="30" rx="2" />
          <rect x="100" y="110" width="15" height="40" rx="2" />
          <rect x="125" y="125" width="15" height="25" rx="2" />
          <rect x="150" y="135" width="15" height="15" rx="2" />
        </g>
        
        {/* Dashed lines for empty state */}
        <g stroke="currentColor" strokeWidth="1" strokeDasharray="3,3" className="text-muted-foreground/30">
          <line x1="40" y1="70" x2="160" y2="70" />
          <line x1="40" y1="90" x2="160" y2="90" />
          <line x1="40" y1="110" x2="160" y2="110" />
          <line x1="40" y1="130" x2="160" y2="130" />
        </g>
        
        {/* Question mark */}
        <g className="text-muted-foreground/40">
          <circle cx="100" cy="85" r="20" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5" />
          <text x="100" y="95" textAnchor="middle" className="text-2xl font-bold" fill="currentColor">?</text>
        </g>
        
        {/* Floating elements */}
        <circle cx="60" cy="170" r="3" fill="currentColor" className="text-primary/40" />
        <circle cx="140" cy="175" r="3" fill="currentColor" className="text-primary/40" />
        <circle cx="170" cy="30" r="2" fill="currentColor" className="text-muted-foreground/40" />
      </svg>
    </div>
  );
}