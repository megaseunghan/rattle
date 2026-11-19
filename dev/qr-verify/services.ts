/** No production service is loaded by this verification bundle. */
export const homeWorkflowLoadMessage = () => '구성을 불러오지 못했어요.';

export const getStoreDetails = async () => ({ id: 'fixture-store', closing_time: '23:00', toss_merchant_id: 'fixture-merchant' });
export function getBusinessDayRange(day: string, _closingTime: string) { const from = new Date(`${day}T00:00:00+09:00`); return { from: from.toISOString(), to: new Date(from.getTime() + 86400000).toISOString() }; }
export function getAutoSyncRange(closingTime: string) { return getBusinessDayRange(new Date().toISOString().slice(0, 10), closingTime); }
