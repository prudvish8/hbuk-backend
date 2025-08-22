# Page snapshot

```yaml
- generic [ref=e4]:
  - heading "Welcome Back" [level=1] [ref=e5]
  - paragraph [ref=e6]: Sign in to your Hbuk
  - generic [ref=e7]:
    - generic [ref=e8]:
      - generic [ref=e9]: Email
      - textbox "Email" [ref=e10]: u2@hbuk.dev
    - generic [ref=e11]:
      - generic [ref=e12]: Password
      - textbox "Password" [active] [ref=e13]: "123456"
    - button "Login" [ref=e14] [cursor=pointer]
  - link "Don't have an account? Register" [ref=e16] [cursor=pointer]:
    - /url: register.html
  - link "← Back to Hbuk" [ref=e18] [cursor=pointer]:
    - /url: index.html
```