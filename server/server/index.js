require('dotenv').config()
const express = require('express')
const cors = require('cors')
const mongoose = require('mongoose')
const multer = require('multer')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const path = require('path')
const axios = require('axios')

const app = express()
app.use(cors())
app.use(express.json())
app.use('/uploads', express.static('uploads'))

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/aisite')

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
  avatar: String
})
const User = mongoose.model('User', userSchema)

// Multer
const storage = multer.diskStorage({
  destination: './uploads/avatars',
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname)
})
const upload = multer({ storage, limits: { fileSize: 3e6 } })

// Режим бога включён: сейчас будет ЖЕСТКИЙ, но 100% рабочий код

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body
    const exists = await User.findOne({ $or: [{ email }, { username }] })
    if (exists) return res.status(400).json({ error: 'Уже существует' })

    const hash = await bcrypt.hash(password, 10)
    const user = await User.create({ username, email, password: hash })
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '7d' })

    res.json({ token, user: { id: user._id, username, email, avatar: user.avatar } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Логин
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    const user = await User.findOne({ email })
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ error: 'Неверные данные' })

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'devsecret', { expiresIn: '7d' })
    res.json({ token, user: { id: user._id, username: user.username, email, avatar: user.avatar } })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Загрузка аватара
app.post('/api/upload/avatar', upload.single('avatar'), async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Нет токена' })

  try {
    const { id } = jwt.verify(token, process.env.JWT_SECRET || 'devsecret')
    const user = await User.findById(id)
    user.avatar = `/uploads/avatars/${req.file.filename}`
    await user.save()
    res.json({ avatar: user.avatar })
  } catch { res.status(401).json({ error: 'Токен плохой' }) }
})

// Чат с Groq
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body
    const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.1-70b-versatile',
      messages,
      temperature: 0.7
    }, {
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }
    })
    res.json({ reply: resp.data.choices[0].message.content })
  } catch (e) {
    console.error(e.response?.data || e.message)
    res.status(500).json({ error: 'Groq упал' })
  }
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Сервер на ${PORT}`))
