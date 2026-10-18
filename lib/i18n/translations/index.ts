import ai from './ai';
import aiPlan from './aiPlan';
import auth from './auth';
import bodyStats from './bodyStats';
import calendar from './calendar';
import calorieBreakdown from './calorieBreakdown';
import common from './common';
import cycle from './cycle';
import datePicker from './datePicker';
import domain from './domain';
import exercise from './exercise';
import features from './features';
import feedback from './feedback';
import home from './home';
import legal from './legal';
import nav from './nav';
import nutrition from './nutrition';
import onboarding from './onboarding';
import paywall from './paywall';
import planEditor from './planEditor';
import plans from './plans';
import profile from './profile';
import scanner from './scanner';
import workout from './workout';

const namespaces = {
  ai,
  aiPlan,
  auth,
  bodyStats,
  calendar,
  calorieBreakdown,
  common,
  cycle,
  datePicker,
  domain,
  exercise,
  features,
  feedback,
  home,
  legal,
  nav,
  nutrition,
  onboarding,
  paywall,
  planEditor,
  plans,
  profile,
  scanner,
  workout,
};

type Namespaces = typeof namespaces;

export type Dictionary = { [N in keyof Namespaces]: Namespaces[N]['de'] };

function pick(lang: 'de' | 'en') {
  return Object.fromEntries(
    Object.entries(namespaces).map(([name, ns]) => [name, ns[lang]]),
  ) as unknown as Dictionary;
}

export const dictionaries: Record<'de' | 'en', Dictionary> = {
  de: pick('de'),
  en: pick('en'),
};
