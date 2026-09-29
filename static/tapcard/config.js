// Fill these in after creating the Supabase project (see setup.sql).
// The publishable/anon key is meant to be public: every write goes through
// database functions that check the invite code or the card's edit token.
// Leave them empty to run in demo mode (cards live only in this browser).
window.TAPCARD_CONFIG = {
  supabaseUrl: 'https://ruypuqkicohjakakfsif.supabase.co',
  supabaseKey: 'sb_publishable_UUF77ArxZZy9vJva9-Hf0Q_eIyU7Dqx',
  bucket: 'tapcard'
};
