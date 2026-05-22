import { Stack } from 'expo-router';

import { ProfileForm } from '@/components/profile/ProfileForm';

export default function EditProfileScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Edit profile', presentation: 'modal' }} />
      <ProfileForm />
    </>
  );
}
