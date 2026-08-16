import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../lib/api';

interface RestaurantInfo {
  restaurantName: string;
  restaurantLogo: string;
}

interface RestaurantContextType {
  restaurant: RestaurantInfo | null;
}

const RestaurantContext = createContext<RestaurantContextType>({ restaurant: null });

export function RestaurantProvider({ children }: { children: React.ReactNode }) {
  const [restaurant, setRestaurant] = useState<RestaurantInfo | null>(null);

  useEffect(() => {
    API.get('/settings')
      .then(res => {
        const data = res.data?.data || res.data;
        if (data) {
          setRestaurant({
            restaurantName: data.restaurantName || 'FlowUp',
            restaurantLogo: data.restaurantLogo || '',
          });

          // Update browser tab title
          if (data.restaurantName) {
            document.title = `${data.restaurantName} — Staff`;
          }

          // Update favicon to restaurant logo if available
          if (data.restaurantLogo) {
            const link: HTMLLinkElement =
              document.querySelector("link[rel~='icon']") || document.createElement('link');
            link.rel = 'icon';
            link.href = data.restaurantLogo;
            document.head.appendChild(link);
          }
        }
      })
      .catch(() => { /* settings fetch failed — use defaults */ });
  }, []);

  return (
    <RestaurantContext.Provider value={{ restaurant }}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  return useContext(RestaurantContext);
}
