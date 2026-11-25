import type { UserDocument } from '../models/User.js';

const supplied = (value: unknown): boolean =>
  typeof value === 'string' ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : false;

export function profileCompletion(user: UserDocument) {
  const profile = user.profile;
  const preferences = user.jobPreferences;
  const fields = [
    ['name', user.name], ['email', user.email], ['profile.firstName', profile?.firstName],
    ['profile.lastName', profile?.lastName], ['profile.phone', profile?.phone],
    ['profile.address.city', profile?.address?.city], ['profile.address.country', profile?.address?.country],
    ['profile.skills.technicalSkills', profile?.skills?.technicalSkills],
    ['profile.education', profile?.education?.filter(item => supplied(item.institution) && supplied(item.degree))], ['jobPreferences.desiredRoles', preferences?.desiredRoles],
    ['jobPreferences.workLocation', preferences?.workLocation]
  ] as const;
  const missing = fields.filter(([, value]) => !supplied(value)).map(([field]) => field);
  return { percentage: Math.round((fields.length - missing.length) / fields.length * 100),
    completed: fields.length - missing.length, total: fields.length, missing };
}
