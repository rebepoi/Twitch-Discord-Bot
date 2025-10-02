# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production || npm i --only=production

COPY . .

ENV NODE_ENV=production

CMD ["npm","start"]
