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
    
    // Computed validation
    get isValid() {
      return this.name.length > 0 
        && this.email.includes('@') 
        && this.agreedToTerms;
    },
    
    submit() {
      if (!this.isValid) {
        alert('Please fill out all required fields');
        return;
      }
      
      console.log('Form submitted:', {
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