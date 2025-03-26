/* eslint-disable */
/* tslint:disable */
// @ts-nocheck
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

import {
  CreateTaskDto,
  TasksControllerCreateTaskData,
  TasksControllerGetTaskData,
  TasksControllerRestartTaskData,
  TasksControllerStartTaskData,
  TasksControllerStopTaskData,
  TasksControllerUpdateTaskData,
  UpdateTaskDto,
} from './data-contracts';
import { ContentType, HttpClient, RequestParams } from './http-client';

export class Tasks<SecurityDataType = unknown> extends HttpClient<SecurityDataType> {
  /**
   * No description
   *
   * @tags Tasks
   * @name TasksControllerCreateTask
   * @request POST:/tasks
   * @response `201` `TasksControllerCreateTaskData`
   */
  tasksControllerCreateTask = (data: CreateTaskDto, params: RequestParams = {}) =>
    this.request<TasksControllerCreateTaskData, any>({
      path: `/tasks`,
      method: 'POST',
      body: data,
      type: ContentType.Json,
      format: 'json',
      ...params,
    });
  /**
   * No description
   *
   * @tags Tasks
   * @name TasksControllerUpdateTask
   * @request PUT:/tasks/{id}
   * @response `201` `TasksControllerUpdateTaskData`
   */
  tasksControllerUpdateTask = (id: string, data: UpdateTaskDto, params: RequestParams = {}) =>
    this.request<TasksControllerUpdateTaskData, any>({
      path: `/tasks/${id}`,
      method: 'PUT',
      body: data,
      type: ContentType.Json,
      format: 'json',
      ...params,
    });
  /**
   * No description
   *
   * @tags Tasks
   * @name TasksControllerGetTask
   * @request GET:/tasks/{id}/status
   * @response `201` `TasksControllerGetTaskData`
   */
  tasksControllerGetTask = (id: string, params: RequestParams = {}) =>
    this.request<TasksControllerGetTaskData, any>({
      path: `/tasks/${id}/status`,
      method: 'GET',
      format: 'json',
      ...params,
    });
  /**
   * No description
   *
   * @tags Tasks
   * @name TasksControllerStartTask
   * @request POST:/tasks/{id}/start
   * @response `201` `TasksControllerStartTaskData`
   */
  tasksControllerStartTask = (id: string, params: RequestParams = {}) =>
    this.request<TasksControllerStartTaskData, any>({
      path: `/tasks/${id}/start`,
      method: 'POST',
      format: 'json',
      ...params,
    });
  /**
   * No description
   *
   * @tags Tasks
   * @name TasksControllerStopTask
   * @request POST:/tasks/{id}/stop
   * @response `201` `TasksControllerStopTaskData`
   */
  tasksControllerStopTask = (id: string, params: RequestParams = {}) =>
    this.request<TasksControllerStopTaskData, any>({
      path: `/tasks/${id}/stop`,
      method: 'POST',
      format: 'json',
      ...params,
    });
  /**
   * No description
   *
   * @tags Tasks
   * @name TasksControllerRestartTask
   * @request POST:/tasks/{id}/restart
   * @response `201` `TasksControllerRestartTaskData`
   */
  tasksControllerRestartTask = (id: string, params: RequestParams = {}) =>
    this.request<TasksControllerRestartTaskData, any>({
      path: `/tasks/${id}/restart`,
      method: 'POST',
      format: 'json',
      ...params,
    });
}
