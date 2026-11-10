import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { HomeWorkflowEditor } from '../../lib/components/HomeWorkflowEditor';

/** Retain the existing settings URL, using the same approved editor as home. */
export default function HomeWorkflowScreen() {
  const [state, setState] = useState({ dirty: false, busy: false });
  const allowLeave = useConfirmLeave(state.dirty || state.busy, { blockLeave: state.busy });
  return <View style={{ flex: 1, backgroundColor: Colors.homeCanvas }}><HomeWorkflowEditor visible initialPhase="open" onStateChange={setState} onClose={() => { allowLeave(); router.back(); }} /></View>;
}
