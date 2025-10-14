import {
  reactive,
  ReactiveHTMLParser,
  createBindings,
} from './re-html';

const model = reactive({
  form: {
    name: '',
    email: '',
    country: '',
    interests: [],
    subscription: 'free',
    bio: '',
    agreedToTerms: false,

    get isValid() {
      return this.name.length > 0
        && this.email.includes('@')
        && this.agreedToTerms;
    },

    // NEW TEST METHODS
    fillDemoData() {
      console.log('📝 Filling demo data...');
      this.name = 'Jane Doe';
      this.email = 'jane@example.com';
      this.country = 'uk';
      this.interests = ['tech', 'travel'];
      this.subscription = 'premium';
      this.bio = 'I love building reactive frameworks!';
      this.agreedToTerms = true;
    },

    clearForm() {
      console.log('🗑️ Clearing form...');
      this.name = '';
      this.email = '';
      this.country = '';
      this.interests = [];
      this.subscription = 'free';
      this.bio = '';
      this.agreedToTerms = false;
    },

    toggleTerms() {
      console.log('🔄 Toggling terms...');
      this.agreedToTerms = !this.agreedToTerms;
    },

    addInterest(interest) {
      console.log('➕ Adding interest:', interest);
      if (!this.interests.includes(interest)) {
        this.interests.push(interest);
      }
    },

    submit() {
      if (!this.isValid) {
        alert('Please fill out all required fields');
        return;
      }

      console.log('✅ Form submitted:', {
        name: this.name,
        email: this.email,
        country: this.country,
        interests: this.interests,
        subscription: this.subscription,
        bio: this.bio
      });

      alert('Registration successful!');
    }
  }
});

const parser = new ReactiveHTMLParser();
const root = document.querySelector('re-registration-form');
const parsed = parser.parse(root);
createBindings(parsed, model);

// Parse the debug panel too
const debugRoot = document.querySelector('re-debug-panel');
const debugParsed = parser.parse(debugRoot);
createBindings(debugParsed, model);
