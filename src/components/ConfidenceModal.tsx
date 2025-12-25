import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Smile, Meh, Frown, Trophy, AlertCircle, XCircle } from 'lucide-react';

interface ConfidenceModalProps {
  isOpen: boolean;
  score: number;
  onSubmit: (confidence: 'high' | 'medium' | 'low') => void;
}

const ConfidenceModal = ({ isOpen, score, onSubmit }: ConfidenceModalProps) => {
  const [selected, setSelected] = useState<'high' | 'medium' | 'low' | null>(null);

  if (!isOpen) return null;

  const getScoreDisplay = () => {
    if (score >= 80) {
      return {
        icon: Trophy,
        color: 'text-success',
        bg: 'bg-success/20',
        message: 'Excellent work!',
      };
    } else if (score >= 50) {
      return {
        icon: AlertCircle,
        color: 'text-warning',
        bg: 'bg-warning/20',
        message: 'Good effort!',
      };
    } else {
      return {
        icon: XCircle,
        color: 'text-destructive',
        bg: 'bg-destructive/20',
        message: 'Keep practicing!',
      };
    }
  };

  const scoreDisplay = getScoreDisplay();
  const ScoreIcon = scoreDisplay.icon;

  const confidenceOptions = [
    {
      value: 'high' as const,
      icon: Smile,
      label: 'High',
      description: 'I understand this well',
      color: 'text-success',
      bg: 'bg-success/10',
      border: 'border-success',
    },
    {
      value: 'medium' as const,
      icon: Meh,
      label: 'Medium',
      description: 'I need a bit more practice',
      color: 'text-warning',
      bg: 'bg-warning/10',
      border: 'border-warning',
    },
    {
      value: 'low' as const,
      icon: Frown,
      label: 'Low',
      description: 'I need to study this more',
      color: 'text-destructive',
      bg: 'bg-destructive/10',
      border: 'border-destructive',
    },
  ];

  return (
    <div className="fixed inset-0 bg-foreground/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-card border-0 animate-slide-in-right rounded-t-3xl sm:rounded-3xl">
        <CardContent className="p-6">
          {/* Score Display */}
          <div className="text-center mb-8">
            <div className={`w-20 h-20 rounded-full ${scoreDisplay.bg} flex items-center justify-center mx-auto mb-4 animate-bounce-in`}>
              <ScoreIcon className={`w-10 h-10 ${scoreDisplay.color}`} />
            </div>
            <p className="text-4xl font-display font-bold text-foreground mb-1">{score}%</p>
            <p className={`text-lg ${scoreDisplay.color} font-semibold`}>{scoreDisplay.message}</p>
          </div>

          {/* Confidence Selection */}
          <div className="mb-6">
            <h3 className="text-lg font-display font-semibold text-foreground text-center mb-4">
              How confident do you feel about this topic?
            </h3>
            
            <div className="space-y-3">
              {confidenceOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = selected === option.value;
                
                return (
                  <button
                    key={option.value}
                    onClick={() => setSelected(option.value)}
                    className={`w-full p-4 rounded-xl border-2 transition-all duration-300 ${
                      isSelected 
                        ? `${option.bg} ${option.border}` 
                        : 'border-border hover:border-primary/30 bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        isSelected ? option.bg : 'bg-background'
                      }`}>
                        <Icon className={`w-6 h-6 ${isSelected ? option.color : 'text-muted-foreground'}`} />
                      </div>
                      <div className="text-left">
                        <p className={`font-semibold ${isSelected ? option.color : 'text-foreground'}`}>
                          {option.label}
                        </p>
                        <p className="text-sm text-muted-foreground">{option.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit Button */}
          <Button
            variant="hero"
            className="w-full"
            disabled={!selected}
            onClick={() => selected && onSubmit(selected)}
          >
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfidenceModal;
