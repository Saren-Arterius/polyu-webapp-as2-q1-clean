/* globals firebase, $, document, window, config, alert, prompt, io */
const blockUI = () => {
  if (!$('.block-ui-overlay')[0]) {
    $('body').append('<div class="block-ui-overlay" style="display: none"><div class="loader"></div></div>');
  }
  $('.block-ui-overlay').show();
};

const unblockUI = () => {
  $('.block-ui-overlay').hide();
};

const setCookie = (name, value) => {
  document.cookie = `${name}=${value}; Path=/`;
  document.cookie = `${name}=${value}; Path=/; domain=${config.base_domain}`;
};

const deleteCookie = (name) => {
  document.cookie = `${name}=; Path=/; domain=${config.base_domain}; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
  document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
};

const logoutFirebase = async () => {
  blockUI();
  await firebase.auth().signOut();
  deleteCookie('authorization');
  window.location = '/';
};

const providerSignIn = async (provider) => {
  await firebase.auth().signInWithPopup(provider);
  let idt = firebase.auth().currentUser.getIdToken();
  setCookie('authorization', idt);
  window.location.reload();
};

$('.btn-google').click(async () => {
  let provider = new firebase.auth.GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/userinfo.email');
  blockUI();
  try {
    await providerSignIn(provider);
  } catch (e) {
    console.log(e);
    unblockUI();
  }
});

$('#login-form').on('submit', async (e) => {
  e.preventDefault();
  blockUI();
  try {
    try {
      await firebase.auth().signInWithEmailAndPassword($('#email').val(), $('#password').val());
    } catch (ex) {
      if (ex.code !== 'auth/user-not-found') {
        throw ex;
      }
      await firebase.auth().createUserWithEmailAndPassword($('#email').val(), $('#password').val());
    }
  } catch (ex) {
    console.log(ex);
    setTimeout(() => {
      alert(`${ex.message}\n(${ex.code})`);
    }, 100);
    unblockUI();
  }
  return false;
});

const forgotPassword = async () => {
  let email = prompt('Email', $('#email').val());
  if (!email) {
    return;
  }
  try {
    blockUI();
    await firebase.auth().sendPasswordResetEmail(email);
    unblockUI();
    setTimeout(() => {
      alert(`The password reset email has been sent to ${email}. Please check your inbox and possibly spam folder.`);
      window.location.reload();
    }, 100);
  } catch (e) {
    console.log(e);
    setTimeout(() => {
      alert(`${e.message}\n(${e.code})`);
    }, 100);
    unblockUI();
  }
};


firebase.initializeApp(config.firebase);

if (window.location.pathname.endsWith('/login')) { // If idt in cookie expired but not client's firebase?
  blockUI();
}

const socket = io();

firebase.auth().onAuthStateChanged(async (user) => {
  if (user) {
    const idt = await user.getIdToken();
    setCookie('authorization', idt);
    if (window.location.pathname.endsWith('/login')) {
      window.location.reload();
    }
  } else if (window.location.pathname.endsWith('/login')) {
    unblockUI();
  }
});
// Prevent eslint nagging

if (!$) {
  logoutFirebase;
  forgotPassword;
  socket;
}
