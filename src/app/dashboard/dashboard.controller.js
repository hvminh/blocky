/*
 * Copyright © 2017 The Blocky Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/* eslint-disable import/no-unresolved, import/default */

/* eslint-enable import/no-unresolved, import/default */

/* eslint-disable angular/angularelement */
import widgetLibrary from './widget-library.tpl.html';
import widgetConfig from './widget-config.tpl.html';
import widgetTemplates from './widget-templates.tpl.html';
import newDashboardTemplate from './new-dashboard.tpl.html';
import renameDashboardTemplate from './rename-dashboard.tpl.html';
import moment from 'moment';

/* eslint-disable no-undef, angular/window-service, angular/document-service */

/*@ngInject*/
export default function DashboardController($scope, userService, dashboardService, store, $window, $mdMedia, $mdSidenav, $document, $timeout, $mdDialog, $rootScope, $translate, toast, $state, settings, Fullscreen, $log) {
    var vm = this;
    var mqttClient;
    var authKey = '';
    var baseTopicUrl = '';

    vm.widgetLibrary = widgetLibrary;
    vm.widgetConfig = widgetConfig;
    vm.widgetTemplates = widgetTemplates;
    vm.dashboards = [];
    vm.currentDashboard = {};
    vm.selectedWidget;
    vm.selectedWidgetIndex;
    vm.currentDashboard.content = [];
    vm.currentDashboard.subscribedTopics = [];
    vm.editMode = false;
    vm.isUserLoaded = userService.isAuthenticated();

    if (vm.isUserLoaded) {
        authKey = userService.getCurrentUser().authKey;
        baseTopicUrl = '/' + authKey + '/';
        loadUserDashboards();
    } else {
        vm.dashboards = [{
            id: 'demo',
            name: 'Demo dashboard',
            content: [{
                name: 'Play Music',
                type: 'button',
                icon: 'icon-bluetooth',
                bgColor: '#e91e63',
                publishMessage: {
                    topic: 'playMusic',
                    message: 'Hello'
                },
                cols: 2,
                rows: 2,
                maxItemCols: 4,
                y: 0,
                x: 0
            }]
        }];
        vm.currentDashboard = vm.dashboards[0];
    }

    vm.gridsterOptions = {
        gridType: 'scrollVertical',
        mobileBreakpoint: 0,
        margin: 4,
        minCols: 16,
        maxCols: 16,
        //compactType: 'compactUp', // compact items: 'none' | 'compactUp' | 'compactLeft' | 'compactUp&Left' | 'compactLeft&Up'
        outerMargin: true,
        draggable: {
            enabled: false
        },
        resizable: {
            enabled: false
        },
        pushItems: true
    };

    vm.lineChartOptions = {
        scales: {
            yAxes: [{
                type: 'linear',
                display: true,
                position: 'left'
            }]
        }
    }

    $timeout(function () {
        onresize();
    });

    $scope.$watch(() => this.currentDashboard, function (newValue, oldValue) {
        if (newValue && !angular.equals(newValue, oldValue)) {
            if (vm.currentDashboard.id) {
                store.set('selectedDashboardId', vm.currentDashboard.id);
            }
        }
    });

    $scope.$on("$destroy", function () {
        if (mqttClient) {
            mqttClient.end();
        }
    });

    vm.defaultSliderValue = 50;

    vm.addNewDashboard = addNewDashboard;
    vm.addDashboard = addDashboard;
    vm.editDashboard = editDashboard;
    vm.saveDashboard = saveDashboard;
    vm.runDashboard = runDashboard;
    vm.renameDashboard = renameDashboard;
    vm.deleteDashboard = deleteDashboard;
    vm.toggleWidgetList = toggleWidgetList;
    vm.toggleWidgetConfig = toggleWidgetConfig;
    vm.addWidget = addWidget;
    vm.widgetAction = widgetAction;
    vm.removeWidget = removeWidget;
    vm.cancel = cancel;
    vm.closeWidgetLibrarySideNav = closeWidgetLibrarySideNav;
    vm.closeWidgetConfigSideNav = closeWidgetConfigSideNav;
    vm.toggleFullScreen = toggleFullScreen;
    vm.Fullscreen = Fullscreen;

    function closeWidgetLibrarySideNav() {
        $mdSidenav('widget-library').close();
    }

    function closeWidgetConfigSideNav() {
        $mdSidenav('widget-config').close();
    }

    function loadUserDashboards() {
        dashboardService.getAllDashboards().then(function success(data) {
            var dashboards = data.dashboards;
            var selectedDashboardId = store.get('selectedDashboardId');
            var selectedDashboardIndex = undefined;
            for (var i = 0; i < dashboards.length; i++) {
                if (dashboards[i].id === selectedDashboardId) {
                    selectedDashboardIndex = i;
                }
                var content = angular.fromJson(dashboards[i].content);
                if (content instanceof Array) {
                    dashboards[i].content = content;
                } else {
                    dashboards[i].content = [];
                }
            }

            vm.dashboards = dashboards;
            if (angular.isDefined(selectedDashboardIndex)) {
                vm.currentDashboard = vm.dashboards[selectedDashboardIndex];
            } else {
                vm.currentDashboard = vm.dashboards[0];
            }

            if (mqtt) {
                mqttClient = mqtt.connect(settings.mqtt.url, {
                    host: settings.mqtt.host,
                    port: settings.mqtt.port,
                    username: '',
                    password: authKey
                });
                mqttClient.on('connect', function () {
                    subscribeDashboardsTopics(data.data);
                });
                mqttClient.on('message', function (topic, message) {
                    $timeout(function () {
                        topic = topic.replace(baseTopicUrl, '');
                        message = message.toString();
                        $log.log('Dashboard Recieved Message:', topic, message);
                        updateDashboardData(topic, message);
                    });
                });
            }
            initDashboardData(data.data);
        });
    }

    function addNewDashboard() {
        vm.newDashboard = null;
        if (vm.isUserLoaded) {
            $mdDialog.show({
                controller: () => this,
                controllerAs: 'vm',
                templateUrl: newDashboardTemplate,
                parent: angular.element($document[0].body),
                fullscreen: false
            }).then(function () {}, function () {});
        } else {
            $rootScope.login();
        }
    }

    function saveDashboard() {
        saveSubscribedTopics();
        dashboardService.saveDashboard(vm.currentDashboard).then(
            function success(data) {
                initDashboardData(data.data);
            },
            function fail() {
                toast.showError($translate.instant('dashboard.dashboard-save-failed-error'));
            }
        );
        $mdDialog.hide();
    }

    function addDashboard() {
        $mdDialog.hide();
        vm.newDashboard.content = [];
        dashboardService.addDashboard(vm.newDashboard).then(
            function success() {
                $state.go($state.current, vm.editDashboard(), {
                    reload: true
                });
            },
            function fail() {
                toast.showError($translate.instant('dashboard.dasboard-save-failed-error'));
            }
        );
    }

    function editDashboard() {
        vm.editMode = true;
        vm.gridsterOptions.draggable.enabled = true;
        vm.gridsterOptions.resizable.enabled = true;
        if (angular.isDefined(vm.gridsterOptions.api)) {
            if (isMobileDevice()) {
                vm.gridsterOptions.margin = 15;
                vm.gridsterOptions.resizable = {
                    enabled: true,
                    handles: {
                        s: false,
                        e: true,
                        n: false,
                        w: true,
                        se: true,
                        ne: true,
                        sw: true,
                        nw: true
                    }
                }
            }
            vm.gridsterOptions.api.optionsChanged();
            vm.gridsterOptions.api.resize();
        }
    }

    function renameDashboard() {
        $mdDialog.show({
            controller: () => this,
            controllerAs: 'vm',
            templateUrl: renameDashboardTemplate,
            parent: angular.element($document[0].body),
            fullscreen: false
        }).then(function () {}, function () {});
    }

    function deleteDashboard($event) {
        var confirm = $mdDialog.confirm()
            .targetEvent($event)
            .title($translate.instant('dashboard.delete-dashboard-title', {
                dashboardName: vm.currentDashboard.name
            }))
            .htmlContent($translate.instant('dashboard.delete-dashboard-text'))
            .ariaLabel($translate.instant('action.delete'))
            .cancel($translate.instant('action.cancel'))
            .ok($translate.instant('action.delete'));
        $mdDialog.show(confirm).then(function () {
                dashboardService.deleteDashboard(vm.currentDashboard.id).then(function success() {
                    $state.go($state.current, null, {
                        reload: true
                    });
                });
            },
            function () {});
    }

    function runDashboard() {
        vm.editMode = false;
        vm.gridsterOptions.draggable.enabled = false;
        vm.gridsterOptions.resizable.enabled = false;
        if (angular.isDefined(vm.gridsterOptions.api)) {
            vm.gridsterOptions.margin = 4;
            vm.gridsterOptions.api.optionsChanged();
            vm.gridsterOptions.api.resize();
        }
        if (vm.isUserLoaded) {
            saveDashboard();
        }
    }

    function onresize() {
        if ($mdMedia('gt-sm')) {
            vm.gridsterOptions.minCols = 16;
            vm.gridsterOptions.maxCols = 16;
        } else if ($mdMedia('sm')) {
            vm.gridsterOptions.minCols = 8;
            vm.gridsterOptions.maxCols = 8;
        } else {
            vm.gridsterOptions.minCols = 4;
            vm.gridsterOptions.maxCols = 4;
        }
        if (angular.isDefined(vm.gridsterOptions.api)) {
            vm.gridsterOptions.api.optionsChanged();
            vm.gridsterOptions.api.resize();
        }
    }

    function toggleWidgetList() {
        $mdSidenav('widget-library').toggle();
    }

    function toggleWidgetConfig(index) {
        if (!vm.editMode) {
            return;
        }
        vm.selectedWidget = vm.currentDashboard.content[index];
        vm.selectedWidgetIndex = index;
        $mdSidenav('widget-config').toggle();
    }

    function addWidget(type) {
        if (type === 'button') {
            vm.currentDashboard.content.push({
                name: 'Button',
                type: 'button',
                icon: 'icon-play-button',
                bgColor: '#e91e63',
                publishMessage: {
                    topic: '',
                    message: ''
                },
                cols: 2,
                rows: 2,
                maxItemCols: 4
            })
        } else if (type === 'switch') {
            vm.currentDashboard.content.push({
                name: 'Switch',
                type: 'switch',
                icon: 'icon-switch',
                bgColor: '#e91e63',
                value: false,
                subscribeMessage: {
                    topic: '',
                    dataType: '1',
                    onMessage: '',
                    offMessage: ''
                },
                cols: 2,
                rows: 2,
                minItemCols: 2,
                minItemRows: 2,
                maxItemCols: 4
            })
        } else if (type === 'slider') {
            vm.currentDashboard.content.push({
                name: 'Slider',
                type: 'slider',
                icon: 'icon-volume-medium',
                bgColor: '#e91e63',
                min: 0,
                max: 100,
                value: 0,
                subscribeMessage: {
                    topic: '',
                    dataType: '1'
                },
                cols: 2,
                rows: 2,
                minItemCols: 2,
                minItemRows: 2,
                maxItemCols: 4
            })
        } else if (type === 'gauge') {
            vm.currentDashboard.content.push({
                name: 'Gauge',
                type: 'gauge',
                icon: 'icon-volume-medium',
                bgColor: '#2196f3',
                displayFormat: '',
                size: 120,
                min: 0,
                max: 100,
                value: 0,
                unit: '',
                subscribeMessage: {
                    topic: '',
                    dataType: '1'
                },
                cols: 2,
                rows: 2,
                maxItemCols: 4
            })
        } else if (type === 'valuedisplay') {
            vm.currentDashboard.content.push({
                name: 'Value Display',
                type: 'valuedisplay',
                icon: 'icon-hot-thermometer',
                bgColor: '#2196f3',
                displayFormat: '',
                subscribeMessage: {
                    topic: '',
                    dataType: '1'
                },
                value: '',
                cols: 2,
                rows: 2,
                maxItemCols: 4
            })
        } else if (type === 'chart') {
            vm.currentDashboard.content.push({
                name: 'Chart',
                type: 'chart',
                bgColor: '#ffffff',
                labels: [],
                data: [
                    []
                ],
                subscribeMessage: {
                    topic: '',
                    dataType: '4h'
                },
                cols: 4,
                rows: 3,
                maxItemCols: 8
            })
        }
        $mdSidenav('widget-library').close();
    }

    function widgetAction(widget) {
        if (vm.editMode) {
            return;
        }
        if (widget.type === 'button') {
            sendMessage(widget.publishMessage.topic, widget.publishMessage.message.toString());
        } else if (widget.type === 'switch') {
            widget.value = !widget.value;
            if (widget.value === true) {
                sendMessage(widget.subscribeMessage.topic, widget.subscribeMessage.onMessage.toString());
            } else {
                sendMessage(widget.subscribeMessage.topic, widget.subscribeMessage.offMessage.toString());
            }
        } else if (widget.type === 'slider') {
            sendMessage(widget.subscribeMessage.topic, widget.value.toString());
        }
    }

    function sendMessage(topic, message) {
        if (!vm.isUserLoaded || !topic.trim().length) {
            return;
        }
        if (!mqttClient || !mqttClient.connected) {
            $timeout(function () {
                sendMqttMessage(topic, message);
            }, 3000);
        } else {
            sendMqttMessage(topic, message);
        }

    }

    function sendMqttMessage(topic, message) {
        topic = baseTopicUrl + topic.trim();
        $log.log('Send Message', topic, message);
        if (mqttClient && mqttClient.connected) {
            mqttClient.publish(topic, message, null, function (err) {
                if (err) {
                    toast.showError($translate.instant('dashboard.send-message-failed-error'));
                }
            });
        } else {
            toast.showError($translate.instant('dashboard.send-message-failed-error'));
        }
    }

    function removeWidget() {
        vm.currentDashboard.content.splice(vm.selectedWidgetIndex, 1);
        $mdSidenav('widget-config').close()
            .then(function () {
                if (angular.isDefined(vm.gridsterOptions.api)) {
                    vm.gridsterOptions.api.optionsChanged();
                    vm.gridsterOptions.api.resize();
                }
            });
    }

    function cancel() {
        $mdDialog.cancel();
    }

    function saveSubscribedTopics() {
        var subscribedTopics = [];
        for (var i = 0; i < vm.dashboards.length; i++) {
            if (vm.dashboards[i].content.length) {
                for (var j = 0; j < vm.dashboards[i].content.length; j++) {
                    var widget = vm.dashboards[i].content[j];
                    if (angular.isDefined(widget.subscribeMessage)) {
                        var topic = widget.subscribeMessage.topic.trim();
                        if (topic.length) {
                            subscribedTopics.push({
                                topic: widget.subscribeMessage.topic.trim(),
                                dataType: widget.subscribeMessage.dataType
                            });
                        }
                    }
                }
            }
        }
        vm.currentDashboard.subscribedTopics = filterDuplidatedTopics(subscribedTopics);

        if (mqttClient && mqttClient.connected) {
            for (var k = 0; k < vm.currentDashboard.subscribedTopics.length; k++) {
                var widgetTopic = vm.currentDashboard.subscribedTopics[k].topic;
                widgetTopic = baseTopicUrl + widgetTopic;
                mqttClient.unsubscribe(widgetTopic);
                $log.log('Save Subscribed Topics:', widgetTopic);
                mqttClient.subscribe(widgetTopic, {
                    qos: 2
                });
            }
        } else {
            $log.log('Save Subscribed Topics. Could not connect to mqtt');
        }
    }

    function updateDashboardData(topic, message) {
        for (var i = 0; i < vm.dashboards.length; i++) {
            if (vm.dashboards[i].content.length) {
                for (var j = 0; j < vm.dashboards[i].content.length; j++) {
                    var widget = vm.dashboards[i].content[j];
                    if (angular.isDefined(widget.subscribeMessage) && topic === widget.subscribeMessage.topic) {
                        if (widget.type === 'switch') {
                            if (widget.subscribeMessage.onMessage === message) {
                                widget.value = true;
                            } else {
                                widget.value = false;
                            }
                        } else if (widget.type === 'slider') {
                            widget.value = Number(message);
                        } else if (widget.type === 'chart') {
                            updateChartData(widget, message);
                        } else {
                            widget.value = message;
                        }
                    }
                }
            }
        }
    }

    function updateChartData(widget, value) {
        widget.labels.push(
            moment(Date.now()).format('MMM Do HH:mm')
        );
        widget.data[0].push(
            Number(value)
        );
    }

    function subscribeDashboardsTopics(data) {
        for (var i = 0; i < data.length; i++) {
            var topic = baseTopicUrl + data[i].topic;
            mqttClient.unsubscribe(topic);
            $log.log('Subscribe Dashboards Topics:', topic);
            mqttClient.subscribe(topic, {
                qos: 2
            });
        }
    }

    function initDashboardData(data) {
        if (!data.length) {
            return;
        }
        for (var i = 0; i < vm.dashboards.length; i++) {
            if (vm.dashboards[i].content.length) {
                for (var j = 0; j < vm.dashboards[i].content.length; j++) {
                    var widget = vm.dashboards[i].content[j];
                    if (angular.isDefined(widget.subscribeMessage)) {
                        var wantedData = data.filter(function (item) {
                            return item.topic === widget.subscribeMessage.topic && item.dataType === widget.subscribeMessage.dataType;
                        });
                        if (wantedData.length) {
                            if (wantedData[0].data.length) {
                                var singleValue = wantedData[0].data[0].data;

                                if (widget.type === 'switch') {
                                    if (widget.subscribeMessage.onMessage === singleValue) {
                                        widget.value = true;
                                    } else {
                                        widget.value = false;
                                    }
                                } else if (widget.type === 'slider') {
                                    widget.value = Number(singleValue);
                                } else if (widget.type === 'chart') {
                                    initChartData(widget, wantedData[0].data);
                                } else {
                                    widget.value = singleValue;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    function initChartData(widget, data) {
        var labels = [];
        var chartData = [];
        data.sort(predicateBy('createdAt'));
        for (var i = 0; i < data.length; i++) {
            labels.push(
                moment(data[i].createdAt).format('MMM Do HH:mm')
            );
            chartData.push(
                data[i].data
            );
        }
        widget.labels = labels;
        widget.data[0] = chartData;
    }

    function filterDuplidatedTopics(data) {
        var topics = {};
        data.forEach(function (item) {
            var topic = topics[item.topic] = topics[item.topic] || {};
            topic[item.dataType] = true;
        });

        var outputList = [];
        for (var topic in topics) {
            for (var dataType in topics[topic]) {
                outputList.push({
                    topic: topic,
                    dataType: dataType
                });
            }
        }

        return outputList;
    }

    function toggleFullScreen() {
        if (Fullscreen.isEnabled()) {
            Fullscreen.cancel();
        } else {
            Fullscreen.all();
        }
    }

    function predicateBy(prop) {
        return function (a, b) {
            if (a[prop] > b[prop]) {
                return 1;
            } else if (a[prop] < b[prop]) {
                return -1;
            }
            return 0;
        }
    }

    function isMobileDevice() {
        return angular.isDefined(window.orientation) || (navigator.userAgent.indexOf('IEMobile') !== -1);
    }
}