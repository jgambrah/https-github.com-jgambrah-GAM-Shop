import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getAnalytics, logEvent as firebaseLogEvent, isSupported } from 'firebase/analytics';
import { db, auth } from '../firebase';

export type AnalyticsEvent = 
  | { type: 'page_view'; page: string }
  | { type: 'button_click'; label: string; id?: string; value?: number; unit?: string; name?: string }
  | { type: 'sale_completed'; total: number; items: number }
  | { type: 'product_added'; name: string; category: string }
  | { type: 'stock_updated'; productId: string; newStock: number }
  | { type: 'error'; message: string; stack?: string };

const analyticsPromise = isSupported().then(supported => supported ? getAnalytics() : null);

export const logEvent = async (event: AnalyticsEvent) => {
  const user = auth.currentUser;
  const timestamp = new Date().toISOString();
  
  const eventData = {
    ...event,
    userId: user?.uid || 'anonymous',
    userEmail: user?.email || 'anonymous',
    timestamp: serverTimestamp(),
    clientTimestamp: timestamp,
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  try {
    // 1. Log to Firestore for custom dashboard/history
    await addDoc(collection(db, 'analytics_events'), eventData);

    // 2. Log to Firebase Analytics if supported and configured
    const analytics = await analyticsPromise;
    if (analytics) {
      const { type, ...params } = event;
      firebaseLogEvent(analytics, type as string, {
        ...params,
        user_id: user?.uid || 'anonymous'
      });
    }
    
    console.log(`[Analytics] ${event.type}:`, event);
  } catch (err) {
    console.error('[Analytics] Failed to log event:', err);
  }
};
