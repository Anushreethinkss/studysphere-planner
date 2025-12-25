import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import BottomNav from '@/components/BottomNav';
import { useToast } from '@/hooks/use-toast';
import { 
  User, Mail, Clock, Flame, Trophy, Target, 
  LogOut, Settings, Bell, Loader2, BookOpen
} from 'lucide-react';

interface Profile {
  name: string;
  email: string;
  prep_type: string | null;
  board: string | null;
  daily_study_hours: number;
  current_streak: number;
  onboarding_completed: boolean;
}

const ProfilePage = () => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState({
    totalTopics: 0,
    completedTopics: 0,
    totalQuizzes: 0,
    avgScore: 0,
  });
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchProfile();
      checkNotificationPermission();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setProfile(profileData);

      // Fetch stats
      const { data: topicsData } = await supabase
        .from('topics')
        .select('status')
        .eq('user_id', user.id);

      const { data: quizzesData } = await supabase
        .from('quizzes')
        .select('score')
        .eq('user_id', user.id)
        .not('score', 'is', null);

      if (topicsData) {
        setStats({
          totalTopics: topicsData.length,
          completedTopics: topicsData.filter(t => ['completed', 'strong'].includes(t.status || '')).length,
          totalQuizzes: quizzesData?.length || 0,
          avgScore: quizzesData && quizzesData.length > 0
            ? Math.round(quizzesData.reduce((acc, q) => acc + (q.score || 0), 0) / quizzesData.length)
            : 0,
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkNotificationPermission = () => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  };

  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      toast({
        variant: 'destructive',
        title: 'Not supported',
        description: 'Notifications are not supported in this browser.',
      });
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationsEnabled(true);
      toast({
        title: 'Notifications enabled!',
        description: 'You will now receive study reminders.',
      });
      
      // Schedule a test notification
      new Notification('StudySphere', {
        body: 'Notifications are now enabled! You\'ll receive study reminders.',
        icon: '/favicon.ico',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Permission denied',
        description: 'Please enable notifications in your browser settings.',
      });
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="bg-gradient-primary text-primary-foreground p-6 pb-20 rounded-b-3xl">
        <h1 className="text-2xl font-display font-bold flex items-center gap-2">
          <User className="w-6 h-6" />
          Profile
        </h1>
      </header>

      <div className="px-4 -mt-16 space-y-4">
        {/* Profile Card */}
        <Card className="shadow-card border-0 animate-fade-up">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-accent flex items-center justify-center">
                <BookOpen className="w-10 h-10 text-accent-foreground" />
              </div>
              <div>
                <h2 className="text-2xl font-display font-bold text-foreground">
                  {profile?.name || 'Student'}
                </h2>
                <p className="text-muted-foreground flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {profile?.email}
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {profile?.prep_type && (
                <Badge variant="secondary">
                  {profile.prep_type === 'school' ? '🎓 School' : '🏆 Competitive'}
                </Badge>
              )}
              {profile?.board && (
                <Badge variant="outline">{profile.board}</Badge>
              )}
              <Badge variant="outline" className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {profile?.daily_study_hours || 2}h/day
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="shadow-card border-0 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            <CardContent className="p-4 text-center">
              <Flame className="w-8 h-8 text-accent mx-auto mb-2" />
              <p className="text-3xl font-bold text-foreground">{profile?.current_streak || 0}</p>
              <p className="text-sm text-muted-foreground">Day Streak</p>
            </CardContent>
          </Card>
          
          <Card className="shadow-card border-0 animate-fade-up" style={{ animationDelay: '0.2s' }}>
            <CardContent className="p-4 text-center">
              <Target className="w-8 h-8 text-primary mx-auto mb-2" />
              <p className="text-3xl font-bold text-foreground">{stats.completedTopics}</p>
              <p className="text-sm text-muted-foreground">Topics Done</p>
            </CardContent>
          </Card>
          
          <Card className="shadow-card border-0 animate-fade-up" style={{ animationDelay: '0.3s' }}>
            <CardContent className="p-4 text-center">
              <BookOpen className="w-8 h-8 text-success mx-auto mb-2" />
              <p className="text-3xl font-bold text-foreground">{stats.totalQuizzes}</p>
              <p className="text-sm text-muted-foreground">Quizzes Taken</p>
            </CardContent>
          </Card>
          
          <Card className="shadow-card border-0 animate-fade-up" style={{ animationDelay: '0.4s' }}>
            <CardContent className="p-4 text-center">
              <Trophy className="w-8 h-8 text-warning mx-auto mb-2" />
              <p className="text-3xl font-bold text-foreground">{stats.avgScore}%</p>
              <p className="text-sm text-muted-foreground">Avg Score</p>
            </CardContent>
          </Card>
        </div>

        {/* Settings */}
        <Card className="shadow-card border-0 animate-fade-up" style={{ animationDelay: '0.5s' }}>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Notifications */}
            <button
              onClick={enableNotifications}
              className="w-full p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Bell className={`w-5 h-5 ${notificationsEnabled ? 'text-success' : 'text-muted-foreground'}`} />
                <div className="text-left">
                  <p className="font-medium text-foreground">Study Reminders</p>
                  <p className="text-sm text-muted-foreground">
                    {notificationsEnabled ? 'Enabled' : 'Click to enable notifications'}
                  </p>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors ${notificationsEnabled ? 'bg-success' : 'bg-muted'}`}>
                <div className={`w-5 h-5 rounded-full bg-card shadow-sm mt-0.5 transition-transform ${notificationsEnabled ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}`} />
              </div>
            </button>

            {/* Reset Study Plan */}
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate('/onboarding')}
            >
              <BookOpen className="w-5 h-5 mr-3" />
              Update Study Plan
            </Button>

            {/* Logout */}
            <Button
              variant="destructive"
              className="w-full justify-start"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5 mr-3" />
              Log Out
            </Button>
          </CardContent>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default ProfilePage;
