import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('App E2E Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/tasks (POST) - create a task', () => {
    return request(app.getHttpServer())
      .post('/tasks')
      .send({ name: 'Test Task', status: 'pending' })
      .expect(201);
  });

  it('/tasks (GET) - get task status', () => {
    return request(app.getHttpServer())
      .get('/tasks/status')
      .expect(200);
  });

  it('/tasks (PATCH) - update a task', () => {
    return request(app.getHttpServer())
      .patch('/tasks/1')
      .send({ status: 'completed' })
      .expect(200);
  });

  it('/tasks/start (POST) - start a task', () => {
    return request(app.getHttpServer())
      .post('/tasks/start/1')
      .expect(200);
  });

  it('/tasks/stop (POST) - stop a task', () => {
    return request(app.getHttpServer())
      .post('/tasks/stop/1')
      .expect(200);
  });

  it('/tasks/restart (POST) - restart a task', () => {
    return request(app.getHttpServer())
      .post('/tasks/restart/1')
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});