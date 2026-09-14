class User {
  constructor({ name, email, password }) {
    this.id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.name = name;
    this.email = email;
    this.password = password;
  }
}
module.exports = User;
