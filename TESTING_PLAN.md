# RLS Testing Plan

This document outlines the manual tests to be performed to verify that the Row Level Security (RLS) policies are working correctly.

## Prerequisites

- You will need to have at least three users with different roles: `admin`, `manager`, and `stock_taker`.
- You will need at least two warehouses.
- The `manager` and `stock_taker` should be assigned to only one of the warehouses.

## Test Cases

### 1. `counts` table

**Test Case 1.1: Stock taker can only create counts in their assigned warehouse.**

1. Log in as the `stock_taker`.
2. Attempt to create a count for a warehouse they are **not** assigned to.
3. **Expected outcome:** The operation should fail with an error message.

**Test Case 1.2: Stock taker can only create counts for an open event.**

1. Log in as the `admin` and close all stocktake events.
2. Log in as the `stock_taker`.
3. Attempt to create a count.
4. **Expected outcome:** The operation should fail with an error message.

**Test Case 1.3: Stock taker can only view counts for their assigned warehouse.**

1. Log in as the `stock_taker`.
2. Go to any page that displays a list of counts.
3. **Expected outcome:** The user should only see counts for the warehouse they are assigned to.

### 2. `products` table

**Test Case 2.1: Non-admin users cannot create, update, or delete products.**

1. Log in as the `manager` or `stock_taker`.
2. Attempt to create, update, or delete a product through any available UI or by making a direct API call.
3. **Expected outcome:** The operation should fail with a permissions error.

**Test Case 2.2: Admin users can create, update, and delete products.**

1. Log in as the `admin`.
2. Go to the 'Bulk Upload' page and upload a product file.
3. **Expected outcome:** The products should be created successfully.

### 3. `recount_tasks` table

**Test Case 3.1: Only managers and admins can create recount tasks.**

1. Log in as the `stock_taker`.
2. Attempt to create a recount task.
3. **Expected outcome:** The operation should fail with a permissions error.

**Test Case 3.2: Stock taker can only see recount tasks assigned to them.**

1. Log in as a `stock_taker`.
2. Go to the 'Recounts' page.
3. **Expected outcome:** The user should only see the tasks that are assigned to them.

### 4. `user_warehouse_assignments` table

**Test Case 4.1: Manager can only manage assignments for their own warehouses.**

1. Log in as a `manager` who is assigned to Warehouse A.
2. Attempt to assign a user to Warehouse B.
3. **Expected outcome:** The operation should fail with a permissions error.
