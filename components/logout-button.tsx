"use client";

import { createClient } from '@/utils/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import ManageBillingButton from './ui/ManageBillingButton'
import { IconChalkboard } from '@tabler/icons-react';

type Subscription = {
  status: string;
} | null;

async function getSubscriptionStatus(
  userId: string
): Promise<Subscription> {
  try {
    const supabase = createClient();
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching subscription:', error);
      return null;
    }

    return subscription;
  } catch (error) {
    console.error('Error in getSubscriptionStatus:', error);
    return null;
  }
}

export function LogoutButton() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [subscription, setSubscription] = useState<Subscription>(null);

  // Handle auth state changes
  useEffect(() => {
    const supabase = createClient();

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      setIsLoggedIn(!!user);
      setUser(user);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      const isLoggedIn = !!user;
      setIsLoggedIn(isLoggedIn);
      setUser(user);

      if (!isLoggedIn) {
        setProfile(null);
        setSubscription(null);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Load profile and subscription when user changes
  useEffect(() => {
    if (!user?.id) return;

    const loadData = async () => {
      const supabase = createClient();

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!profileError && profileData) {
        setProfile(profileData);
      }

      // Load subscription
      const subscriptionData = await getSubscriptionStatus(user.id);
      setSubscription(subscriptionData);
    };

    loadData();
  }, [user?.id]);

  const logout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    
    // Reset welcome header state on logout
    localStorage.removeItem('medauth-welcome-seen');
    
    router.push('/auth/login');
  };

  if (!isLoggedIn) return null;

  return (
    <div className='flex items-center space-between gap-5'>
      <div className='flex-col'>
        <p className='text-black font-bold sentence-case text-sm'>
          {profile?.full_name || profile?.email || ''}
        </p>
      </div>

      {subscription?.status === 'active' && (
        <>
          <div className='text-gray-300'>|</div>
          <ManageBillingButton />
          <div className='text-gray-300'>|</div>
        </>
      )}
      <Button
        onClick={logout}
        size="sm"

        className="text-white red-gradiet"
      >

        Logout
      </Button>
    </div>
  );
}