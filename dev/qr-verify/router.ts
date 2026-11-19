import { useEffect } from 'react';
import { change } from './fixtures';
export const router = { push: (route: string | { pathname: string }) => change({ scene: typeof route === 'string' ? route : route.pathname }), replace: (scene: string) => change({ scene }), back: () => change({ scene: 'home' }) };
export function useFocusEffect(callback: () => void | (() => void)) { useEffect(callback, [callback]); }
export const useNavigation = () => ({ addListener: () => () => {}, dispatch: () => {} });
