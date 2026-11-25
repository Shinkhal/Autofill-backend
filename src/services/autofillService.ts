import type { UserDocument } from '../models/User.js';
import type { AutofillField } from '../schemas/autofill.js';

function normalize(input: string): string {
  return input.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const aliases = {
  fullName: ['full name', 'name', 'candidate name'],
  firstName: ['first name', 'given name', 'fname'],
  lastName: ['last name', 'family name', 'surname', 'lname'],
  preferredName: ['preferred name', 'nick name'],
  email: ['email', 'email address', 'e mail'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'tel', 'telephone'],
  linkedin: ['linkedin', 'linkedin url', 'linkedin profile'],
  github: ['github', 'github url', 'github profile'],
  portfolio: ['portfolio', 'portfolio url', 'website', 'personal website'],
  street: ['address', 'street address', 'address line 1', 'address line1'],
  city: ['city', 'town', 'address level2'],
  state: ['state', 'province', 'address level1'],
  zipCode: ['postal code', 'zip code', 'zip', 'pincode', 'pin code'],
  country: ['country', 'country name'],
  degree: ['degree', 'highest degree'],
  fieldOfStudy: ['field of study', 'major', 'specialization'],
  institution: ['institution', 'university', 'school', 'college', 'university name'],
  gpa: ['gpa', 'cgpa', 'grade point average'],
  company: ['company', 'employer', 'company name'],
  jobTitle: ['job title', 'position title'],
  currentCompany: ['current company', 'current employer'],
  currentJobTitle: ['current job title', 'current position'],
  skills: ['skills', 'technical skills'],
  desiredRoles: ['desired role', 'desired roles', 'preferred role'],
  workLocation: ['preferred work location', 'preferred location'],
  workAuthorization: ['work authorization', 'authorized to work'],
  visaSponsorship: ['visa sponsorship', 'require visa sponsorship', 'sponsorship required'],
  relocate: ['willing to relocate', 'relocate', 'relocation'],
  noticePeriod: ['notice period'],
  availableFrom: ['available from', 'availability date', 'earliest start date'],
  expectedSalary: ['expected salary', 'salary expectation', 'expected compensation'],
  remotePreference: ['remote preference', 'work arrangement'],
  summary: ['professional summary', 'about yourself', 'tell us about yourself', 'brief introduction']
} as const;
type Key = keyof typeof aliases;
const aliasMap = new Map<string, Key>();
for (const [key, values] of Object.entries(aliases)) {
  aliasMap.set(normalize(key), key as Key);
  values.forEach(value => aliasMap.set(value, key as Key));
}
const autocompleteMap: Record<string, Key> = {
  name: 'fullName', 'given-name': 'firstName', 'family-name': 'lastName', nickname: 'preferredName',
  email: 'email', tel: 'phone', 'street-address': 'street', 'address-line1': 'street',
  'address-level2': 'city', 'address-level1': 'state', 'postal-code': 'zipCode', 'country-name': 'country', url: 'portfolio'
};

function entry<T>(items: ArrayLike<T> | undefined, index?: number): T | undefined {
  if (index !== undefined) return items?.[index];
  return items?.length === 1 ? items[0] : undefined;
}
function valueFor(user: UserDocument, key: Key, index?: number): string | undefined {
  const p = user.profile;
  const prefs = user.jobPreferences;
  const education = entry(p?.education, index);
  const experience = entry(p?.experience, index);
  const current = entry(p?.experience?.filter(row => row.isCurrentJob === true));
  const values: Record<Key, string | null | undefined> = {
    fullName: user.name, firstName: p?.firstName, lastName: p?.lastName,
    preferredName: p?.preferredName, email: user.email, phone: p?.phone,
    linkedin: p?.linkedin, github: p?.github, portfolio: p?.portfolio,
    street: p?.address?.street, city: p?.address?.city, state: p?.address?.state,
    zipCode: p?.address?.zipCode, country: p?.address?.country,
    degree: education?.degree, fieldOfStudy: education?.fieldOfStudy, institution: education?.institution, gpa: education?.gpa,
    company: experience?.company, jobTitle: experience?.jobTitle,
    currentCompany: current?.company, currentJobTitle: current?.jobTitle,
    skills: p?.skills?.technicalSkills?.join(', '), desiredRoles: prefs?.desiredRoles,
    workLocation: prefs?.workLocation, workAuthorization: prefs?.workAuthorization,
    visaSponsorship: prefs?.visaSponsorship, relocate: prefs?.relocate, noticePeriod: prefs?.noticePeriod,
    availableFrom: prefs?.availableFrom, expectedSalary: prefs?.expectedSalary, remotePreference: prefs?.remotePreference,
    summary: p?.summary
  };
  // Do not assume "current" employment or a particular degree when multiple records exist.
  return values[key]?.trim() || undefined;
}

export function mapField(user: UserDocument, field: AutofillField) {
  const manual = (reason: string) => ({ id: field.id, status: 'manual' as const, reason });
  if (['hidden', 'password', 'file', 'other'].includes(field.type)) return manual('unsupported_field_type');
  const hints = [aliasMap.get(normalize(field.label ?? '')), aliasMap.get(normalize(field.name ?? '')),
    Object.hasOwn(autocompleteMap, field.autocomplete?.split(/\s+/).at(-1) ?? '') ? autocompleteMap[field.autocomplete?.split(/\s+/).at(-1) ?? ''] : undefined].filter((value): value is Key => Boolean(value));
  const unique = [...new Set(hints)];
  if (unique.length !== 1) return manual(unique.length ? 'conflicting_field_hints' : 'unknown_field');
  const key = unique[0]!;
  // A user-provided name/profile is the only source; no guessing protected traits or eligibility.
  let value = valueFor(user, key, field.itemIndex);
  if (!value && key === 'summary') {
    const skills = user.profile?.skills?.technicalSkills?.filter(Boolean);
    if (skills?.length && field.type === 'textarea') {
      return { id: field.id, status: 'suggestion' as const, source: 'profile.skills.technicalSkills',
        value: 'My technical skills include ' + skills.join(', ') + '.', requiresReview: true };
    }
  }
  if (!value) return manual('missing_or_ambiguous_profile_data');
  if (field.type === 'checkbox') return manual('explicit_confirmation_required');
  if (['select', 'radio'].includes(field.type)) {
    const matches = field.options?.filter(option => normalize(option.label) === normalize(value!) || normalize(option.value) === normalize(value!)) ?? [];
    if (matches.length !== 1) return manual('no_unique_option_match');
    value = matches[0]!.value;
  }
  if (field.type === 'number' && !/^-?\d+(?:\.\d+)?$/.test(value)) return manual('incompatible_value_type');
  if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return manual('incompatible_value_type');
  if (field.type === 'email' && key !== 'email') return manual('incompatible_value_type');
  if (field.type === 'tel' && key !== 'phone') return manual('incompatible_value_type');
  if (field.type === 'url' && (!['linkedin', 'github', 'portfolio'].includes(key) || !/^https?:\/\//i.test(value))) return manual('incompatible_value_type');
  return { id: field.id, status: 'matched' as const, source: key, value, requiresReview: true };
}

export function mapFields(user: UserDocument, fields: AutofillField[]) {
  const results = fields.map(field => mapField(user, field));
  return { results, matched: results.filter(result => result.status === 'matched').length,
    suggestions: results.filter(result => result.status === 'suggestion').length,
    manual: results.filter(result => result.status === 'manual').length };
}
